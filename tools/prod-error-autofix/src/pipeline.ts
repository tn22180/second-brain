import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {analyze, type AnalyzeOutcome} from './agent/analyze';
import type {Analysis} from './agent/analysisSchema';
import type {ClaudeRunner} from './agent/claudeCli';
import {fix, type FixOutcome} from './agent/fix';
import {recordCandidate, writeIncident} from './agent/learn';
import {buildSlice} from './brain/slice';
import type {Config} from './config';
import {fetchLogs, summarize, type LogBundle} from './gcloud/logs';
import {probeDeploy} from './gcloud/deploy';
import type {Runner} from './gcloud/run';
import {buildMrBody, openMr} from './git/openMr';
import {probeMerge} from './git/mergeProbe';
import {branchNameFor, createWorktree, removeWorktree, worktreeDirFor} from './git/worktree';
import {fingerprintOf} from './fingerprint';
import {parseAlert, type ParsedAlert} from './parseAlert';
import {appNames, resolveApp, type App} from './registry';
import type {SlackApi} from './slack/client';
import type {IncomingMessage} from './slack/listener';
import {postReply} from './slack/post';
import * as reply from './slack/reply';
import {checkConcurrency, checkMrCaps, recordMr} from './state/rateGate';
import {decide, INCONCLUSIVE_RETRY_MS, type AlertStatus, type DeployProbe} from './state/stateMachine';
import type {Store} from './state/store';
import {describeSmoke, measureBaseline, smokeGate, type SmokeOutcome} from './verify/smoke';

/**
 * One alert, start to finish.
 *
 * Ordering is deliberate in three places:
 *  - the merge/deploy probe runs *before* deciding, because "the error came back" only
 *    means the fix failed if the fix actually shipped
 *  - the jest baseline is measured *after* analysis and *before* the fix, which is the
 *    only moment the worktree is both known-needed and still clean
 *  - the MR rate cap is checked *after* analysis, so a capped job still reports what it
 *    found instead of going quiet
 */

export interface PipelineDeps {
  cfg: Config;
  store: Store;
  slack: SlackApi;
  claude?: ClaudeRunner;
  runner?: Runner;
  now?: () => number;
  log?: (line: string) => void;
}

export interface JobResult {
  handled: boolean;
  fingerprint: string | undefined;
  status: AlertStatus | undefined;
  mrUrl: string | undefined;
  replied: boolean;
  detail: string;
  costUsd: number;
}

const REGION = 'us-central1';

function jobDir(cfg: Config, fingerprint: string, attempt: number): string {
  const dir = join(cfg.paths.jobsRoot, fingerprint, String(attempt));
  mkdirSync(dir, {recursive: true});
  return dir;
}

export async function runPipeline(deps: PipelineDeps, message: IncomingMessage): Promise<JobResult> {
  const {cfg, store, slack} = deps;
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  const nowMs = now();

  const nothing = (detail: string): JobResult => ({
    handled: false,
    fingerprint: undefined,
    status: undefined,
    mrUrl: undefined,
    replied: false,
    detail,
    costUsd: 0
  });

  const parsed = parseAlert({text: message.text, blocks: message.blocks});
  if (!parsed.ok) return nothing(`not an alert: ${parsed.reason}`);
  const alert = parsed.alert;

  const app = resolveApp(alert.appName, cfg);
  const fingerprint = fingerprintOf({
    appName: alert.appName,
    service: alert.service ?? 'unknown',
    kind: alert.kind,
    message: alert.message
  });

  const say = async (text: string): Promise<boolean> => {
    try {
      await postReply({slack, store, now}, {channel: message.channel, threadTs: message.ts, text});
      store.markReplied(fingerprint, nowMs);
      return true;
    } catch (e) {
      log(`slack reply failed for ${fingerprint}: ${(e as Error).message}`);
      return false;
    }
  };

  if (!app) {
    store.seenAlert({
      fingerprint,
      appName: alert.appName,
      repo: 'unknown',
      service: alert.service,
      kind: alert.kind,
      alertTsMs: Math.round(Number(message.ts) * 1000) || nowMs,
      threadTs: message.ts
    });
    store.patchAlert(fingerprint, {status: 'unknown_app'});
    const replied = await say(reply.replyUnknownApp({appName: alert.appName, known: appNames(), fingerprint}));
    return {handled: true, fingerprint, status: 'unknown_app', mrUrl: undefined, replied, detail: 'app not in registry', costUsd: 0};
  }

  const alertTsMs = Math.round(Number(message.ts) * 1000) || nowMs;
  const {previous} = store.seenAlert({
    fingerprint,
    appName: alert.appName,
    repo: app.repo,
    service: alert.service,
    kind: alert.kind,
    alertTsMs,
    threadTs: message.ts
  });

  // Probe only when there is something to probe: a fix that was already pushed.
  let probe: DeployProbe | undefined;
  if (previous?.fixSha && (previous.status === 'mr_open' || previous.status === 'awaiting_deploy' || previous.status === 'fix_failed')) {
    probe = await runProbes(deps, app, alert, previous.fixSha, previous.branch);
  }

  const decision = decide({
    existing: previous,
    kind: alert.kind,
    alertTsMs,
    nowMs,
    probe,
    maxFixAttempts: cfg.caps.maxFixAttempts,
    replyCooldownMs: cfg.caps.replyCooldownMs,
    inconclusiveRetryMs: INCONCLUSIVE_RETRY_MS
  });
  log(`${fingerprint} ${alert.appName}/${alert.service ?? '?'} → ${decision.reason} (run=${decision.run})`);

  if (!decision.run) {
    store.patchAlert(fingerprint, {status: decision.nextStatus});
    let replied = false;
    if (decision.reply) {
      const current = store.getAlert(fingerprint)!;
      replied = await say(
        reply.replyRepeat({
          fingerprint,
          appName: alert.appName,
          attempt: current.attempts,
          reason: decision.reason,
          mrUrl: previous?.mrUrl,
          recurrenceCount: current.recurrenceCount,
          mrAgeMinutes: probe?.mergedAtMs ? Math.round((nowMs - probe.mergedAtMs) / 60000) : undefined,
          detail: undefined
        })
      );
    }
    return {handled: true, fingerprint, status: decision.nextStatus, mrUrl: previous?.mrUrl, replied, detail: decision.reason, costUsd: 0};
  }

  // One job at a time. A second pipeline on the same repo would fight over branches.
  const concurrency = checkConcurrency(store, cfg.caps);
  if (!concurrency.allowed) {
    store.patchAlert(fingerprint, {status: 'deferred', note: `deferred: ${concurrency.detail}`});
    const replied = decision.reply
      ? await say(
          reply.replyRepeat({
            fingerprint,
            appName: alert.appName,
            attempt: decision.attempt,
            reason: 'job_in_flight',
            mrUrl: previous?.mrUrl,
            recurrenceCount: store.getAlert(fingerprint)?.recurrenceCount ?? 1,
            mrAgeMinutes: undefined,
            detail: concurrency.detail
          })
        )
      : false;
    return {handled: true, fingerprint, status: 'deferred', mrUrl: undefined, replied, detail: 'concurrency', costUsd: 0};
  }

  store.patchAlert(fingerprint, {status: 'analyzing', attempts: decision.attempt});
  store.markRun(fingerprint, nowMs);

  return runJob(deps, {app, alert, fingerprint, message, attempt: decision.attempt, allowMr: decision.allowMr, previous, say});
}

async function runProbes(
  deps: PipelineDeps,
  app: App,
  alert: ParsedAlert,
  fixSha: string,
  branch: string | undefined
): Promise<DeployProbe | undefined> {
  const {cfg} = deps;
  const merge = await probeMerge(
    {repoPath: app.repoPath, baseBranch: app.defaultBranch, fixSha, fixBranch: branch, timeoutMs: cfg.timeouts.gcloudMs},
    deps.runner
  );
  // An unreachable probe must never read as a failed fix, so it stays undefined.
  if (!merge.ok) return undefined;
  if (!merge.value.merged) return {merged: false, mergedAtMs: undefined, deployedAtMs: undefined};

  const deploy = await probeDeploy(
    {
      projectId: app.prodProject,
      serviceName: alert.serviceName ?? 'api',
      isJob: alert.isJob,
      region: REGION,
      timeoutMs: cfg.timeouts.gcloudMs
    },
    deps.runner
  );
  return {
    merged: true,
    mergedAtMs: merge.value.mergedAtMs,
    deployedAtMs: deploy.ok ? deploy.value.deployedAtMs : undefined
  };
}

interface JobInput {
  app: App;
  alert: ParsedAlert;
  fingerprint: string;
  message: IncomingMessage;
  attempt: number;
  allowMr: boolean;
  previous: {rootCause?: string; mrUrl?: string} | undefined;
  say: (text: string) => Promise<boolean>;
}

async function runJob(deps: PipelineDeps, input: JobInput): Promise<JobResult> {
  const {cfg, store} = deps;
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  const {app, alert, fingerprint, attempt, say} = input;
  const dir = jobDir(cfg, fingerprint, attempt);
  let costUsd = 0;
  let worktreeDir: string | undefined;
  let keepWorktree = false;

  const finish = async (status: AlertStatus, detail: string, extras: Partial<JobResult> = {}): Promise<JobResult> => {
    store.patchAlert(fingerprint, {status, note: detail.slice(0, 500)});
    if (worktreeDir && !keepWorktree) {
      const removed = await removeWorktree({repoPath: app.repoPath, dir: worktreeDir, timeoutMs: cfg.timeouts.gcloudMs}, deps.runner);
      if (!removed.ok) log(`worktree cleanup failed for ${fingerprint}: ${removed.detail}`);
    }
    return {
      handled: true,
      fingerprint,
      status,
      mrUrl: undefined,
      replied: false,
      detail,
      costUsd,
      ...extras
    };
  };

  // Logs first: a gcloud auth failure is cheap to hit and would waste a model run.
  const logsRes = await fetchLogs(
    {
      projectId: app.prodProject,
      service: alert.serviceName,
      alertTsMs: Math.round(Number(input.message.ts) * 1000) || now(),
      windowMs: cfg.logWindowMs,
      limit: 200,
      timeoutMs: cfg.timeouts.gcloudMs
    },
    deps.runner
  );
  let logs: LogBundle | undefined;
  let logsPath: string | undefined;
  if (logsRes.ok) {
    logs = logsRes.value;
    logsPath = join(dir, 'logs.json');
    writeFileSync(logsPath, JSON.stringify(logs.raw, null, 2), 'utf8');
    log(`${fingerprint} logs: ${summarize(logs)}`);
  } else if (logsRes.failure === 'auth' || logsRes.failure === 'permission') {
    const replied = await say(
      reply.replyBlocked({fingerprint, appName: alert.appName, attempt, what: `gcloud ${logsRes.failure}`, detail: logsRes.detail})
    );
    return await finish('blocked', `gcloud ${logsRes.failure}: ${logsRes.detail}`, {replied});
  }

  const worktree = await createWorktree(
    {
      repoPath: app.repoPath,
      baseBranch: app.defaultBranch,
      branch: branchNameFor(alert.appName, fingerprint, attempt),
      dir: worktreeDirFor(cfg.paths.worktreeRoot, app.repo, fingerprint, attempt),
      timeoutMs: cfg.timeouts.gcloudMs
    },
    deps.runner
  );
  if (!worktree.ok) {
    const replied = await say(
      reply.replyBlocked({fingerprint, appName: alert.appName, attempt, what: 'không dựng được worktree', detail: worktree.detail})
    );
    return await finish('blocked', `worktree: ${worktree.detail}`, {replied});
  }
  worktreeDir = worktree.value.dir;
  store.patchAlert(fingerprint, {branch: worktree.value.branch});

  const slice = buildSlice({
    brainRoot: cfg.paths.brainRoot,
    appName: alert.appName,
    fingerprint,
    service: alert.service,
    message: alert.message,
    tokenBudget: cfg.brainSliceTokenBudget
  });
  if (slice.overBudget) log(`${fingerprint} brain slice over budget: ${slice.tokens}/${slice.budget}`);

  const analysis = await analyze(
    {
      alert,
      fingerprint,
      repoPath: worktree.value.dir,
      projectId: app.prodProject,
      brainSlice: slice.text,
      logs,
      logsPath,
      model: cfg.models.analyze,
      maxRounds: cfg.analyzeMaxRounds,
      timeoutMs: cfg.timeouts.analyzeRoundMs,
      gcloudTimeoutMs: cfg.timeouts.gcloudMs,
      previousAttempt: input.previous?.rootCause
        ? {mrUrl: input.previous.mrUrl, rootCause: input.previous.rootCause, diff: undefined}
        : undefined
    },
    {claude: deps.claude, runner: deps.runner}
  );
  costUsd += analysis.totalCostUsd;
  writeFileSync(join(dir, 'analysis.json'), JSON.stringify(analysis, null, 2), 'utf8');

  if (!analysis.ok) {
    const replied = await say(
      reply.replyInconclusive({
        fingerprint,
        appName: alert.appName,
        attempt,
        analysis: analysis.analysis,
        rounds: analysis.rounds.length,
        costUsd,
        detail: analysis.detail ?? 'no verified root cause'
      })
    );
    await learn(deps, {app, alert, fingerprint, attempt, analysis: analysis.analysis, status: 'inconclusive', outcome: analysis.detail ?? 'inconclusive', rounds: analysis.rounds.length, costUsd, message: input.message});
    return await finish('inconclusive', analysis.detail ?? 'inconclusive', {replied});
  }

  const verified: Analysis = analysis.analysis!;

  // Infra is measured and reported, never auto-fixed: tiers cost money.
  if (verified.isInfra || alert.kind === 'infra' || !input.allowMr) {
    const replied = await say(
      reply.replyInfra({fingerprint, appName: alert.appName, attempt, analysis: verified, detail: undefined})
    );
    await learn(deps, {app, alert, fingerprint, attempt, analysis: verified, status: 'infra', outcome: 'infra class — reported, no MR', rounds: analysis.rounds.length, costUsd, message: input.message});
    return await finish('infra', 'infra class, no autofix', {replied});
  }

  const caps = checkMrCaps(store, cfg.caps, app.repo, now());
  if (!caps.allowed) {
    const replied = await say(
      reply.replyCapped({fingerprint, appName: alert.appName, attempt, analysis: verified, cap: caps.cap!, detail: caps.detail!})
    );
    await learn(deps, {app, alert, fingerprint, attempt, analysis: verified, status: 'deferred', outcome: `MR deferred by ${caps.cap}`, rounds: analysis.rounds.length, costUsd, message: input.message});
    return await finish('deferred', `capped: ${caps.detail}`, {replied});
  }

  // The only moment the worktree is both known-needed and still clean.
  let baseline = store.getBaseline(app.repo, worktree.value.baseSha);
  if (!baseline) {
    const measured = await measureBaseline(
      {repoPath: worktree.value.dir, testCmd: app.testCmd, timeoutMs: cfg.timeouts.jestMs},
      deps.runner
    );
    if (measured.ok) {
      baseline = measured.failures;
      store.putBaseline(app.repo, worktree.value.baseSha, baseline, now());
      log(`${fingerprint} baseline ${app.repo}@${worktree.value.baseSha.slice(0, 8)}: ${baseline.length} failing`);
    } else {
      log(`${fingerprint} baseline failed: ${measured.detail}`);
    }
  }

  const fixed: FixOutcome = await fix(
    {
      analysis: verified,
      alert,
      repoPath: worktree.value.dir,
      brainSlice: slice.text,
      model: cfg.models.fix,
      timeoutMs: cfg.timeouts.fixMs,
      attempt,
      previousAttempt: input.previous?.rootCause ? {rootCause: input.previous.rootCause, diff: undefined} : undefined
    },
    {claude: deps.claude, runner: deps.runner}
  );
  costUsd += fixed.costUsd;

  if (!fixed.ok) {
    keepWorktree = true;
    const replied = await say(
      reply.replyGateFailed({
        fingerprint,
        appName: alert.appName,
        attempt,
        analysis: verified,
        gate: fixed.failure ?? 'fix',
        detail: fixed.detail ?? '',
        smoke: undefined,
        worktreeKept: worktreeDir
      })
    );
    await learn(deps, {app, alert, fingerprint, attempt, analysis: verified, status: 'inconclusive', outcome: `fix blocked at ${fixed.failure}`, rounds: analysis.rounds.length, costUsd, message: input.message, diffStat: fixed.diffStat});
    return await finish('inconclusive', `fix ${fixed.failure}: ${fixed.detail}`, {replied});
  }

  const smoke: SmokeOutcome = await smokeGate(
    {
      repoPath: worktree.value.dir,
      testCmd: app.testCmd,
      baseline,
      sourceFiles: fixed.sourceFiles,
      testFiles: fixed.testFiles,
      timeoutMs: cfg.timeouts.jestMs
    },
    deps.runner
  );

  if (!smoke.ok) {
    keepWorktree = true;
    const replied = await say(
      reply.replyGateFailed({
        fingerprint,
        appName: alert.appName,
        attempt,
        analysis: verified,
        gate: smoke.failure ?? 'smoke',
        detail: smoke.detail ?? '',
        smoke,
        worktreeKept: worktreeDir
      })
    );
    await learn(deps, {app, alert, fingerprint, attempt, analysis: verified, status: 'inconclusive', outcome: `smoke gate ${smoke.failure}`, rounds: analysis.rounds.length, costUsd, message: input.message, diffStat: fixed.diffStat, smokeLine: describeSmoke(smoke)});
    return await finish('inconclusive', `smoke ${smoke.failure}: ${smoke.detail}`, {replied});
  }

  const threadUrl = await deps.slack.permalink({channel: input.message.channel, ts: input.message.ts}).catch(() => undefined);
  const mrBody = buildMrBody({
    appName: alert.appName,
    service: alert.service,
    fingerprint,
    rootCause: verified.rootCause,
    mechanism: verified.mechanism,
    citations: verified.citations,
    evidence: verified.evidence,
    agentSummary: fixed.summary,
    risks: fixed.risks,
    smokeLine: describeSmoke(smoke),
    logsUrl: alert.logsUrl,
    threadUrl,
    attempt
  });

  const mr = await openMr(
    {
      worktreeDir: worktree.value.dir,
      branch: worktree.value.branch,
      baseBranch: app.defaultBranch,
      title: fixed.mrTitle,
      description: mrBody,
      timeoutMs: cfg.timeouts.gcloudMs
    },
    deps.runner
  );

  if (!mr.ok) {
    keepWorktree = true;
    // A pushed branch with no MR is a click away from done, so it gets its own
    // reply carrying the create link and the body — not a generic gate failure.
    const replied = await say(
      mr.pushed
        ? reply.replyPushedNoMr({
            fingerprint,
            appName: alert.appName,
            attempt,
            analysis: verified,
            smoke,
            branch: worktree.value.branch,
            createMrUrl: mr.createMrUrl,
            mrTitle: fixed.mrTitle,
            mrBody,
            detail: mr.detail ?? ''
          })
        : reply.replyGateFailed({
            fingerprint,
            appName: alert.appName,
            attempt,
            analysis: verified,
            gate: mr.failure ?? 'open_mr',
            detail: mr.detail ?? '',
            smoke,
            worktreeKept: worktreeDir
          })
    );
    store.patchAlert(fingerprint, {
      fixSha: mr.fixSha,
      branch: worktree.value.branch,
      note: mr.createMrUrl ? `pushed, create MR by hand: ${mr.createMrUrl}` : undefined
    });
    await learn(deps, {app, alert, fingerprint, attempt, analysis: verified, status: 'inconclusive', outcome: `MR not opened: ${mr.failure}`, rounds: analysis.rounds.length, costUsd, message: input.message, diffStat: fixed.diffStat, smokeLine: describeSmoke(smoke), fixSha: mr.fixSha});
    return await finish('inconclusive', `open_mr ${mr.failure}: ${mr.detail}`, {replied});
  }

  recordMr(store, app.repo, now());
  store.patchAlert(fingerprint, {status: 'mr_open', mrUrl: mr.mrUrl, fixSha: mr.fixSha, branch: worktree.value.branch});
  const replied = await say(
    reply.replyMrOpened({
      fingerprint,
      appName: alert.appName,
      attempt,
      analysis: verified,
      smoke,
      mrUrl: mr.mrUrl!,
      costUsd,
      rounds: analysis.rounds.length
    })
  );
  await learn(deps, {
    app,
    alert,
    fingerprint,
    attempt,
    analysis: verified,
    status: 'mr_open',
    outcome: `MR opened: ${mr.mrUrl}`,
    rounds: analysis.rounds.length,
    costUsd,
    message: input.message,
    diffStat: fixed.diffStat,
    smokeLine: describeSmoke(smoke),
    fixSha: mr.fixSha,
    mrUrl: mr.mrUrl,
    branch: worktree.value.branch
  });

  const result = await finish('mr_open', `MR opened ${mr.mrUrl}`, {replied, mrUrl: mr.mrUrl});
  // finish() would otherwise reset the status it just wrote.
  store.patchAlert(fingerprint, {status: 'mr_open'});
  return result;
}

interface LearnCall {
  app: App;
  alert: ParsedAlert;
  fingerprint: string;
  attempt: number;
  analysis: Analysis | undefined;
  status: AlertStatus;
  outcome: string;
  rounds: number;
  costUsd: number;
  message: IncomingMessage;
  diffStat?: string;
  smokeLine?: string;
  fixSha?: string;
  mrUrl?: string;
  branch?: string;
}

/**
 * The incident record is written from job facts, not by a model. The one thing a
 * model would add — a generalisation — goes to candidates and needs a second
 * sighting from a different fingerprint before anything trusts it.
 */
async function learn(deps: PipelineDeps, call: LearnCall): Promise<void> {
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  try {
    writeIncident(
      {brainRoot: deps.cfg.paths.brainRoot},
      {
        fingerprint: call.fingerprint,
        alert: call.alert,
        repo: call.app.repo,
        status: call.status,
        attempt: call.attempt,
        analysis: call.analysis,
        rounds: call.rounds,
        costUsd: call.costUsd,
        mrUrl: call.mrUrl,
        branch: call.branch,
        fixSha: call.fixSha,
        diffStat: call.diffStat,
        smokeLine: call.smokeLine,
        outcome: call.outcome,
        dateIso: new Date(now()).toISOString(),
        threadTs: call.message.ts
      }
    );
    if (call.analysis && call.status === 'mr_open') {
      const res = recordCandidate(
        {brainRoot: deps.cfg.paths.brainRoot},
        {app: call.alert.appName, claim: call.analysis.rootCause, fingerprint: call.fingerprint}
      );
      if (res.readyToPromote) log(`brain: candidate for ${call.alert.appName} seen ${res.seen}× — ready to promote`);
    }
  } catch (e) {
    // Never fail a job because the brain could not be written.
    log(`learn failed for ${call.fingerprint}: ${(e as Error).message}`);
  }
}
