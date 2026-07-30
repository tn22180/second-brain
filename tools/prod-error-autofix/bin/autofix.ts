#!/usr/bin/env bun
import {buildConfig, ConfigError, redact} from '../src/config';
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
  promoteCandidate,
  statusReport
} from '../src/cli/commands';
import {runPipeline} from '../src/pipeline';
import {createSlackApi} from '../src/slack/client';
import {createListener, createPollTransport, createSocketTransport} from '../src/slack/listener';
import {Store} from '../src/state/store';

/**
 * The harness. `daemon` is what launchd runs; everything else exists so this project
 * can be inspected and calibrated without waiting for a production error.
 */

const USAGE = `autofix — prod error → MR

  daemon                      nghe #prod-errors và chạy pipeline (launchd chạy lệnh này)
  status                      queue, cap còn lại, 10 incident gần nhất
  dry-run <file> [--prompt]   feed alert giả: in registry + fingerprint + brain slice, KHÔNG gọi model
  run <ts|slack-url>          chạy pipeline trên đúng 1 message trong channel (CÓ thể mở MR thật)
  replay <fingerprint>        chạy lại pipeline trên một incident đã lưu (không post Slack trừ --post)
  incidents                   liệt kê fingerprint đã lưu
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

  let cfg;
  try {
    cfg = buildConfig();
  } catch (e) {
    if (e instanceof ConfigError) fail(`config: ${e.message}`);
    throw e;
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
      if (cfg.transport === 'poll') {
        log('không có SLACK_APP_TOKEN → poll conversations.history; thêm xapp- token để chuyển sang Socket Mode');
      }

      const transport =
        cfg.transport === 'socket' && cfg.slackAppToken
          ? createSocketTransport({appToken: cfg.slackAppToken, log})
          : createPollTransport({cfg, store, slack, log});

      const listener = createListener({
        cfg,
        store,
        slack,
        transport,
        log,
        onAlert: async message => {
          const res = await runPipeline({cfg, store, slack, now, log}, message);
          if (res.handled) {
            log(`→ ${res.fingerprint} status ${res.status} · ${res.detail} · $${res.costUsd.toFixed(2)}`);
          }
        }
      });

      const shutdown = async (signal: string) => {
        log(`${signal} — đang dừng`);
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
