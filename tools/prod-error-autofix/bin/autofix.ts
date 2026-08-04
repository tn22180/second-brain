#!/usr/bin/env bun
import {homedir} from 'node:os';
import {join} from 'node:path';
import {buildConfig, ConfigError, loadEnv, PROJECT_ROOT, redact} from '../src/config';
import {
  brainBudget,
  dryRun,
  formatBudget,
  formatDryRun,
  formatStatus,
  incidentToMessage,
  listCandidates,
  listIncidents,
  loadAlertFile,
  markMr,
  promoteCandidate,
  statusReport
} from '../src/cli/commands';
import {sweepWorktrees} from '../src/git/worktreeGc';
import {doctor, formatDoctor} from '../src/setup/doctor';
import {formatInit, initInstall} from '../src/setup/init';
import {formatSweep, sweepVerify} from '../src/verify/sweep';
import {runPipeline} from '../src/pipeline';
import {listApps} from '../src/registry';
import {createSlackApi} from '../src/slack/client';
import {createListener, createPollTransport, createSocketTransport} from '../src/slack/listener';
import {Store} from '../src/state/store';

/**
 * The harness. `daemon` is what launchd runs; everything else exists so this project
 * can be inspected and calibrated without waiting for a production error.
 */

const USAGE = `autofix — prod error → MR

  init [--label X] [--service-account <email>] [--force-plist]
                              dựng install: .env, thư mục cache, skeleton brain, plist cho máy này
  doctor [--quick]            soi mọi thứ daemon cần: claude, gcloud, git SSH, Slack, từng repo app
  daemon                      nghe #prod-errors và chạy pipeline (launchd chạy lệnh này)
  status                      queue, cap còn lại, 10 incident gần nhất
  dry-run <file> [--prompt]   feed alert giả: in registry + fingerprint + brain slice, KHÔNG gọi model
  run <ts|slack-url>          chạy pipeline trên đúng 1 message trong channel (CÓ thể mở MR thật)
  replay <fingerprint>        chạy lại pipeline trên một incident đã lưu (không post Slack trừ --post)
  verify [--apply] [--fp <fingerprint>]
                              đếm lỗi trong log trước merge vs sau deploy để biết fix có ăn không;
                              mặc định chỉ đọc, --apply mới ghi fix_verified/fix_failed
  incidents                   liệt kê fingerprint đã lưu
  mark <fp> --mr <url> [--cause "..."]
                              ghi nhận MR mở bằng tay vào index.md + incident + state DB
  brain budget                đo token slice từng app, exit 1 nếu vượt
  brain candidates            liệt kê candidate đang chờ
  brain promote <n> [--force] đưa candidate #n vào apps/<app>.md (cần seen >= 2)

  --help                      bản này
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const args = argv.filter(a => a !== '--');
  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }

  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  // `init` exists to create the config, so it must run before the config is required.
  if (command === 'init') {
    const env = loadEnv();
    const cacheRoot = env.AUTOFIX_CACHE_ROOT || join(homedir(), '.cache', 'prod-autofix');
    console.log(
      formatInit(
        initInstall({
          projectRoot: PROJECT_ROOT,
          cacheRoot,
          brainRoot: env.AUTOFIX_BRAIN_ROOT || join(PROJECT_ROOT, 'brain'),
          label: flag('--label') || 'com.avada.prod-error-autofix',
          serviceAccount: flag('--service-account') || env.CLOUDSDK_CORE_ACCOUNT,
          env: {...process.env, ...env},
          forcePlist: args.includes('--force-plist')
        })
      )
    );
    return;
  }

  let cfg;
  let configError: ConfigError | undefined;
  try {
    cfg = buildConfig();
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    // Everything except `doctor` needs a real config. `doctor` is how an operator finds
    // out *why* there isn't one, so it runs anyway on placeholder credentials and
    // reports the missing keys as its first blocking check.
    if (command !== 'doctor') fail(`config: ${e.message}`);
    configError = e;
    cfg = buildConfig({...loadEnv(), SLACK_BOT_TOKEN: 'unset', SLACK_ERROR_CHANNEL_ID: 'unset'});
  }

  if (command === 'doctor') {
    const report = await doctor({
      cfg,
      quick: args.includes('--quick'),
      slack: configError ? undefined : createSlackApi(cfg.slackBotToken)
    });
    if (configError) {
      report.checks.unshift({
        group: 'config',
        name: '.env',
        status: 'fail',
        detail: `thiếu ${configError.missing.join(', ')}`,
        fix: 'chạy `autofix init` rồi điền vào .env'
      });
      report.ok = false;
    }
    console.log(formatDoctor(report));
    if (!report.ok) process.exit(1);
    return;
  }

  const store = new Store(cfg.paths.stateDb);
  const now = () => Date.now();

  switch (command) {
    case 'status': {
      console.log(formatStatus(statusReport(cfg, store, now())));
      return;
    }

    case 'dry-run': {
      const path = args[1];
      if (!path) fail('dùng: autofix dry-run <file.json|file.txt> [--prompt]');
      console.log(formatDryRun(dryRun(cfg, store, loadAlertFile(path)), {showPrompt: args.includes('--prompt')}));
      return;
    }

    case 'incidents': {
      console.log(listIncidents(cfg));
      return;
    }

    case 'verify': {
      const i = args.indexOf('--fp');
      const only = i > 0 ? args[i + 1] : undefined;
      const apply = args.includes('--apply');
      const report = await sweepVerify(
        {cfg, store, now, log: line => console.error(line)},
        {apply, only}
      );
      console.log(formatSweep(report));
      return;
    }

    case 'mark': {
      const fp = args[1];
      const mrUrl = flag('--mr');
      if (!fp || !mrUrl) fail('dùng: autofix mark <fingerprint> --mr <url> [--cause "..."]');
      const res = markMr(cfg, store, {
        fingerprint: fp,
        mrUrl,
        cause: flag('--cause'),
        dateIso: new Date(now()).toISOString()
      });
      console.log(res.detail);
      if (!res.ok) process.exit(1);
      return;
    }

    case 'run': {
      const arg = args[1];
      if (!arg) fail('dùng: autofix run <ts|slack-url> [--no-post]');
      // Accepts a raw ts, or a Slack permalink: .../p1785408826442739
      const fromUrl = /\/p(\d{10})(\d{6})/.exec(arg);
      const ts = fromUrl ? `${fromUrl[1]}.${fromUrl[2]}` : arg;
      const slack = createSlackApi(cfg.slackBotToken);
      // conversations.history with `oldest` is exclusive, so step back a tick to
      // include the message itself.
      const oldest = (Number(ts) - 0.000001).toFixed(6);
      const found = (await slack.history({channel: cfg.errorChannelId, oldestTs: oldest, limit: 20})).find(
        m => m.ts === ts
      );
      if (!found) fail(`không tìm thấy message ts ${ts} trong ${cfg.errorChannelId}`);
      const post = !args.includes('--no-post');
      const api = post
        ? slack
        : {
            ...slack,
            postThreadReply: async ({text}: {text: string}) => {
              console.log('\n--- reply (không post) ---\n' + text + '\n');
              return {ts: undefined};
            }
          };
      console.log(`run ts ${ts}${post ? ' · POST reply thật vào thread · CÓ THỂ MỞ MR THẬT' : ' · không post'}`);
      console.log(`text: ${(found.text ?? '').slice(0, 160)}`);
      const res = await runPipeline({cfg, store, slack: api, now, log: line => console.log(line)}, {
        ...found,
        channel: cfg.errorChannelId,
        eventId: undefined
      });
      console.log(
        `\n→ status ${res.status} · ${res.detail} · $${res.costUsd.toFixed(2)}${res.mrUrl ? ` · ${res.mrUrl}` : ''}`
      );
      return;
    }

    case 'replay': {
      const fingerprint = args[1];
      if (!fingerprint) fail('dùng: autofix replay <fingerprint> [--post]');
      const message = incidentToMessage(cfg, fingerprint, cfg.errorChannelId);
      if (!message) fail(`không dựng lại được alert từ incident ${fingerprint}`);
      const post = args.includes('--post');
      const slack = createSlackApi(cfg.slackBotToken);
      // Without --post the replies are printed here instead of going to the channel:
      // a replay is for calibration, and the thread it came from is long since closed.
      const quietSlack = post
        ? slack
        : {
            ...slack,
            postThreadReply: async ({text}: {text: string}) => {
              console.log('\n--- reply (không post) ---\n' + text + '\n');
              return {ts: undefined};
            }
          };
      console.log(`replay ${fingerprint}${post ? ' (POST thật vào Slack)' : ' (không post)'}`);
      const res = await runPipeline({cfg, store, slack: quietSlack, now, log: line => console.log(line)}, message);
      console.log(`\n→ status ${res.status} · ${res.detail} · $${res.costUsd.toFixed(2)}${res.mrUrl ? ` · ${res.mrUrl}` : ''}`);
      return;
    }

    case 'brain': {
      const sub = args[1];
      if (sub === 'budget') {
        const rows = brainBudget(cfg);
        console.log(formatBudget(rows));
        if (rows.some(r => r.over)) fail('\nbrain slice vượt budget — cắt bớt trước khi chạy');
        return;
      }
      if (sub === 'candidates') {
        console.log(listCandidates(cfg));
        return;
      }
      if (sub === 'promote') {
        const n = Number(args[2]);
        if (!Number.isInteger(n) || n < 1) fail('dùng: autofix brain promote <n> [--force]');
        const res = promoteCandidate(cfg, n, args.includes('--force'));
        console.log(res.detail);
        if (!res.ok) process.exit(1);
        return;
      }
      fail('dùng: autofix brain budget|candidates|promote');
    }

    case 'daemon': {
      const slack = createSlackApi(cfg.slackBotToken);
      const log = (line: string) => console.log(`[${new Date().toISOString()}] ${line}`);
      log(`autofix daemon · transport ${cfg.transport} · channel ${cfg.errorChannelId} · token ${redact(cfg.slackBotToken)}`);
      log(`state ${cfg.paths.stateDb} · worktrees ${cfg.paths.worktreeRoot} · brain ${cfg.paths.brainRoot}`);
      log(
        `caps: ${cfg.caps.maxConcurrentJobs} song song · ${cfg.caps.mrPerHour} MR/h · ` +
          `${cfg.caps.mrPerRepoPerDay} MR/repo/ngày · analyze ${cfg.analyzeMaxRounds} vòng`
      );
      log(
        cfg.verifyIntervalMs > 0
          ? `verify sweep mỗi ${Math.round(cfg.verifyIntervalMs / 3_600_000)}h`
          : 'verify sweep: tắt (AUTOFIX_VERIFY_INTERVAL_MS=0)'
      );
      // Notifying is optional, so a missing token fails silently at MR time. Say at
      // startup which mode this process is in, or the first "why no Telegram?" costs
      // a config re-derivation.
      log(
        cfg.telegram
          ? `telegram: chat ${cfg.telegram.chatId}${cfg.telegram.threadId ? ` · topic ${cfg.telegram.threadId}` : ''} · token ${redact(cfg.telegram.botToken)}`
          : 'telegram: chưa cấu hình → không báo MR ra ngoài Slack'
      );
      if (cfg.transport === 'poll') {
        log('không có SLACK_APP_TOKEN → poll conversations.history; thêm xapp- token để chuyển sang Socket Mode');
      }

      const transport =
        cfg.transport === 'socket' && cfg.slackAppToken
          ? createSocketTransport({appToken: cfg.slackAppToken, log})
          : createPollTransport({cfg, store, slack, log});

      // A job whose process died never writes a terminal status, so it holds its
      // concurrency slot forever and every later alert comes back `deferred`.
      // Swept on a timer as well as before each alert: the timer is what unsticks a
      // queue that is already frozen, since nothing else runs while it is.
      // Reclaim then sweep, in that order: a job freed here no longer owns its
      // worktree, so the same pass can reclaim the checkout too.
      const reclaim = async () => {
        const freed = store.reclaimStale(now() - cfg.timeouts.staleJobMs, now());
        if (freed.length) log(`reclaimed ${freed.length} stale job(s): ${freed.join(', ')}`);

        const swept = await sweepWorktrees({
          apps: listApps(cfg),
          worktreeRoot: cfg.paths.worktreeRoot,
          activeFingerprints: new Set(store.activeFingerprints()),
          timeoutMs: cfg.timeouts.gcloudMs
        });
        for (const p of swept.preserved) log(`orphaned work committed @ ${p.sha.slice(0, 9)} before reclaiming ${p.dir}`);
        if (swept.removed.length) log(`reclaimed ${swept.removed.length} orphaned worktree(s)`);
        for (const f of swept.failed) log(`worktree ${f.dir} left in place: ${f.detail}`);
      };
      await reclaim();
      const reclaimTimer = setInterval(() => void reclaim(), cfg.pollIntervalMs);

      // Measures whether shipped fixes held. Skipped while a pipeline is running: the
      // sweep is serial but still spends two gcloud reads per fingerprint, and the job
      // in flight has the better claim on that quota.
      const verify = async () => {
        if (store.activeCount() > 0) return;
        try {
          const report = await sweepVerify({cfg, store, now, log}, {apply: true});
          const counts = new Map<string, number>();
          for (const r of report.rows) counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1);
          if (report.checked) {
            log(
              `verify sweep: ${report.checked} fingerprint · ` +
                [...counts].map(([v, n]) => `${v} ${n}`).join(', ')
            );
          }
        } catch (e) {
          log(`verify sweep failed: ${(e as Error).message}`);
        }
      };
      const verifyTimer =
        cfg.verifyIntervalMs > 0 ? setInterval(() => void verify(), cfg.verifyIntervalMs) : undefined;

      const listener = createListener({
        cfg,
        store,
        slack,
        transport,
        log,
        onAlert: async message => {
          await reclaim();
          const res = await runPipeline({cfg, store, slack, now, log}, message);
          if (res.handled) {
            log(`→ ${res.fingerprint} status ${res.status} · ${res.detail} · $${res.costUsd.toFixed(2)}`);
          }
        }
      });

      const shutdown = async (signal: string) => {
        log(`${signal} — đang dừng`);
        clearInterval(reclaimTimer);
        if (verifyTimer) clearInterval(verifyTimer);
        await listener.stop();
        store.close();
        process.exit(0);
      };
      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));

      const {backfilled, skipped} = await listener.start();
      log(`backfill ${backfilled} alert · bỏ qua ${JSON.stringify(skipped)}`);
      // Keep the process alive; the transport owns the loop from here.
      await new Promise<void>(() => {});
      return;
    }

    default:
      fail(`lệnh không có: ${command}\n\n${USAGE}`);
  }
}

await main(process.argv.slice(2));
