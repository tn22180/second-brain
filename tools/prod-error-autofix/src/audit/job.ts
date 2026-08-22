import {join} from 'node:path';
import type {App} from '../registry';
import type {Store} from '../state/store';
import type {WorktreeInput, WorktreeResult} from '../git/worktree';
import {findingFp} from './findingFp';
import {classify, type AuditFinding, type LedgerDiff} from './ledger';
import type {LaneFailure} from './report';
import type {AppReportInput} from './report';
import type {LintResult, RunEslintInput} from './eslint';
import type {SecurityLaneInput, SecurityLaneResult} from './securityLane';
import type {SecurityFinding} from './securitySchema';
import type {TriageFinding, TriageInput, TriageResult, TriageVerdict, Verdict} from './triage';
import type {MrLaneInput, MrLaneKind, MrLaneResult} from './mr';

/**
 * One app, start to finish: worktree → Lane A + Lane B concurrently → ledger →
 * optional MR lane → worktree removed. `runAudit` (./run.ts) calls this once per
 * app, sequentially, and is what supplies the run-level settings and side effects.
 *
 * Every side effect — including the two agent lanes themselves, not just the
 * `claude`/`Runner` primitives underneath them — is injected here, so a test can
 * make a whole lane throw without a real `claude -p` process existing at all.
 */

export interface AuditJobSettings {
  worktreeRoot: string;
  /** `yyyy-mm-dd`, or anything `auditBranchName`-style digit-stripping tolerates. */
  dateStr: string;
  mrEnabled: boolean;
  /** Monday full digest vs. an ordinary "what's new" day — see report.ts. */
  digest: boolean;
  nowMs: number;
  /** Worktree create/remove. Git operations here are fast; not the LLM timeouts below. */
  gitTimeoutMs: number;
  security: {model: string; timeoutMs: number};
  triage: {model: string; timeoutMs: number};
  eslintTimeoutMs: number;
  /**
   * The MR lane's own agent + jest timeouts. There is no separate `AUDIT_MR_*`
   * config: it is the same fix agent as the daemon's own FIX stage, so it reuses
   * `AUTOFIX_FIX_MODEL` / `AUTOFIX_FIX_TIMEOUT_MS` / `AUTOFIX_JEST_TIMEOUT_MS`
   * rather than inventing a parallel set of knobs for the same thing.
   */
  mr: {model: string; agentTimeoutMs: number; jestTimeoutMs: number};
}

export interface AuditJobDeps {
  cfg: AuditJobSettings;
  createWorktree: (input: WorktreeInput) => Promise<WorktreeResult>;
  linkNodeModules: (input: {repoPath: string; worktreeDir: string}) => Promise<{linked: string[]; missing: string[]}>;
  removeWorktree: (
    input: {repoPath: string; dir: string; timeoutMs: number}
  ) => Promise<{ok: boolean; detail: string | undefined}>;
  runEslintLane: (input: RunEslintInput) => Promise<LintResult>;
  securityLane: (input: SecurityLaneInput) => Promise<SecurityLaneResult>;
  triageLane: (input: TriageInput) => Promise<TriageResult>;
  /** Never called when `cfg.mrEnabled` is false — the caller must not even construct one. */
  runMrLane: (input: MrLaneInput & {kind: MrLaneKind}) => Promise<MrLaneResult>;
  store: Store;
}

export interface AppAuditResult {
  appName: string;
  ok: boolean;
  report: AppReportInput;
  costUsd: number | undefined;
  mr: {security: MrLaneResult | undefined; cleanup: MrLaneResult | undefined};
}

/**
 * Never `~/.cache/prod-autofix/wt/<repo>-<fingerprint>` (that is `worktreeDirFor`,
 * the fix lane's own naming) — the audit sweeps the whole repo, not one
 * fingerprint, and the two must never collide on a directory.
 */
export function auditJobWorktreeDir(worktreeRoot: string, repo: string, dateStr: string): string {
  return join(worktreeRoot, `audit-${repo}-${dateStr.replace(/[^0-9]/g, '')}`);
}

/**
 * This worktree is read-only in practice — nothing here ever commits or pushes it —
 * so the branch name only has to be a legal, collision-free ref, not one of
 * `auditBranchName`'s two MR kinds.
 */
function sweepBranchName(repo: string, dateStr: string): string {
  const slug = repo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `audit/sweep-${slug}-${dateStr.replace(/[^0-9]/g, '')}`;
}

function addCost(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + b;
}

function emptyLedger(): LedgerDiff {
  return {fresh: [], carried: 0, resolved: 0, suppressed: 0, resolvedRows: []};
}

function securityToFinding(app: App, f: SecurityFinding): AuditFinding {
  return {
    fp: findingFp({app: app.appName, file: f.file, rule: f.category, title: f.title}),
    app: app.appName,
    kind: 'security',
    file: f.file,
    line: f.line,
    rule: f.category,
    title: f.title,
    severity: f.severity,
    verdict: undefined
  };
}

function lintToFinding(app: App, f: TriageFinding, verdict: Verdict | undefined): AuditFinding {
  return {
    fp: f.fp,
    app: app.appName,
    kind: 'hygiene',
    file: f.file,
    line: f.line,
    rule: f.rule,
    title: f.message,
    // eslint gives no severity of its own; `medium` matches the spec's own worked
    // example (report.ts §Report) rather than defaulting every lint finding to the
    // quietest emoji, which would bury a real no-undef (missing import) in the noise.
    severity: 'medium',
    verdict
  };
}

interface HygieneOutcome {
  lint: TriageFinding[];
  verdicts: TriageVerdict[];
  deletable: TriageVerdict[];
  costUsd: number | undefined;
  laneFailures: LaneFailure[];
}

/**
 * Deterministic first, agent second (spec, "Lane B"). A thrown or failed eslint
 * run takes the whole lane down — there is nothing to triage. A failed or thrown
 * TRIAGE, by contrast, must not lose eslint's real findings: every finding falls
 * back to `unsure`, the triage lane's own safe default, and is still reported.
 */
async function runHygieneLane(app: App, worktreeDir: string, deps: AuditJobDeps): Promise<HygieneOutcome> {
  const outFile = join(deps.cfg.worktreeRoot, `eslint-${app.repo}-${deps.cfg.dateStr.replace(/[^0-9]/g, '')}.json`);
  const eslintRes = await deps.runEslintLane({
    worktreeDir,
    lintPaths: app.auditLintPaths,
    outFile,
    timeoutMs: deps.cfg.eslintTimeoutMs
  });
  if (!eslintRes.ok) {
    return {
      lint: [],
      verdicts: [],
      deletable: [],
      costUsd: undefined,
      laneFailures: [{lane: 'hygiene', detail: `${eslintRes.failure}: ${eslintRes.detail}`}]
    };
  }
  if (!eslintRes.findings.length) {
    return {lint: [], verdicts: [], deletable: [], costUsd: undefined, laneFailures: []};
  }

  const lint: TriageFinding[] = eslintRes.findings.map(f => ({
    ...f,
    fp: findingFp({app: app.appName, file: f.file, rule: f.rule, title: f.message})
  }));

  const unsure = (reason: string): TriageVerdict[] => lint.map(f => ({fp: f.fp, verdict: 'unsure', reason}));

  let triageRes: TriageResult;
  try {
    triageRes = await deps.triageLane({
      appName: app.appName,
      worktreeDir,
      model: deps.cfg.triage.model,
      timeoutMs: deps.cfg.triage.timeoutMs,
      brainSlice: undefined,
      findings: lint
    });
  } catch (e) {
    return {
      lint,
      verdicts: unsure('triage threw'),
      deletable: [],
      costUsd: undefined,
      laneFailures: [{lane: 'triage', detail: (e as Error).message ?? 'threw'}]
    };
  }

  if (!triageRes.ok) {
    return {
      lint,
      verdicts: unsure('triage failed'),
      deletable: [],
      costUsd: triageRes.costUsd,
      laneFailures: [{lane: 'triage', detail: `${triageRes.failure}: ${triageRes.detail}`}]
    };
  }

  return {lint, verdicts: triageRes.verdicts, deletable: triageRes.deletable, costUsd: triageRes.costUsd, laneFailures: []};
}

function failedAppResult(app: App, laneFailures: LaneFailure[]): AppAuditResult {
  return {
    appName: app.appName,
    ok: false,
    costUsd: undefined,
    mr: {security: undefined, cleanup: undefined},
    report: {
      appName: app.appName,
      ledger: emptyLedger(),
      openFindings: [],
      hasSecuritySkill: false,
      laneFailures
    }
  };
}

export async function runAuditJob(app: App, deps: AuditJobDeps): Promise<AppAuditResult> {
  const dir = auditJobWorktreeDir(deps.cfg.worktreeRoot, app.repo, deps.cfg.dateStr);
  const branch = sweepBranchName(app.repo, deps.cfg.dateStr);

  const worktree = await deps.createWorktree({
    repoPath: app.repoPath,
    baseBranch: app.defaultBranch,
    branch,
    dir,
    timeoutMs: deps.cfg.gitTimeoutMs
  });
  // Nothing was created, so there is nothing to remove — the spec's "worktree
  // cannot be created → app skipped, named in the message" stops right here.
  if (!worktree.ok) {
    return failedAppResult(app, [
      {lane: 'security', detail: `worktree: ${worktree.detail}`},
      {lane: 'hygiene', detail: `worktree: ${worktree.detail}`}
    ]);
  }

  try {
    // Without this the repo's own eslint binary is not there to run at all.
    await deps.linkNodeModules({repoPath: app.repoPath, worktreeDir: dir});

    const [secSettled, hygSettled] = await Promise.allSettled([
      deps.securityLane({
        appName: app.appName,
        worktreeDir: dir,
        model: deps.cfg.security.model,
        timeoutMs: deps.cfg.security.timeoutMs,
        // Measured 2026-08-20: every app's brain slice is 23289-23805 tokens against
        // a 6000 budget, ~4x over. Appending that to every lane of every app, every
        // morning, is a real cost for no measured benefit yet — `undefined` until a
        // trimmed audit-specific slice exists.
        brainSlice: undefined
      }),
      runHygieneLane(app, dir, deps)
    ]);

    const laneFailures: LaneFailure[] = [];
    let hasSecuritySkill = false;
    let securityCost: number | undefined;
    let securityFindings: SecurityFinding[] = [];

    if (secSettled.status === 'fulfilled') {
      const res = secSettled.value;
      hasSecuritySkill = res.hasSecuritySkill;
      securityCost = res.costUsd;
      if (res.ok) securityFindings = res.findings;
      else laneFailures.push({lane: 'security', detail: `${res.failure}: ${res.detail}`});
    } else {
      laneFailures.push({lane: 'security', detail: (secSettled.reason as Error)?.message ?? 'threw'});
    }

    let lintFindings: TriageFinding[] = [];
    let verdicts: TriageVerdict[] = [];
    let hygieneCost: number | undefined;

    if (hygSettled.status === 'fulfilled') {
      const res = hygSettled.value;
      lintFindings = res.lint;
      verdicts = res.verdicts;
      hygieneCost = res.costUsd;
      laneFailures.push(...res.laneFailures);
    } else {
      laneFailures.push({lane: 'hygiene', detail: (hygSettled.reason as Error)?.message ?? 'threw'});
    }

    const verdictByFp = new Map(verdicts.map(v => [v.fp, v.verdict] as const));
    const found: AuditFinding[] = [
      ...securityFindings.map(f => securityToFinding(app, f)),
      ...lintFindings.map(f => lintToFinding(app, f, verdictByFp.get(f.fp)))
    ];

    const ledger = classify(deps.store, app.appName, found, deps.cfg.nowMs);
    // Only read on a digest day: the whole point of the daily message is NOT
    // repeating the backlog every morning, so there is no reason to pay for the
    // read the other six days.
    const openFindings = deps.cfg.digest ? deps.store.openAuditFindings(app.appName) : [];

    let mr: {security: MrLaneResult | undefined; cleanup: MrLaneResult | undefined} = {
      security: undefined,
      cleanup: undefined
    };
    let mrCost: number | undefined;

    if (deps.cfg.mrEnabled) {
      const common: MrLaneInput = {
        appName: app.appName,
        repo: app.repo,
        repoPath: app.repoPath,
        baseBranch: app.defaultBranch,
        worktreeRoot: deps.cfg.worktreeRoot,
        dateStr: deps.cfg.dateStr,
        model: deps.cfg.mr.model,
        brainSlice: undefined,
        testCmd: app.testCmd,
        security: securityFindings,
        lint: lintFindings,
        verdicts,
        nowMs: deps.cfg.nowMs,
        timeouts: {git: deps.cfg.gitTimeoutMs, agent: deps.cfg.mr.agentTimeoutMs, jest: deps.cfg.mr.jestTimeoutMs}
      };
      const security = await deps.runMrLane({...common, kind: 'security'});
      const cleanup = await deps.runMrLane({...common, kind: 'cleanup'});
      mr = {security, cleanup};
      mrCost = addCost(security.costUsd, cleanup.costUsd);

      // The ledger's `mr_url` records the MR next to the finding's status, not
      // instead of it — a finding with an MR out is still present in the code
      // until the merge lands (spec, "An open MR is not a status").
      if (security.mrUrl) {
        for (const f of securityFindings) {
          deps.store.setAuditFindingMr(findingFp({app: app.appName, file: f.file, rule: f.category, title: f.title}), security.mrUrl);
        }
      }
      if (cleanup.mrUrl) {
        const deleted = new Set(verdicts.filter(v => v.verdict === 'delete').map(v => v.fp));
        for (const f of lintFindings) {
          if (deleted.has(f.fp)) deps.store.setAuditFindingMr(f.fp, cleanup.mrUrl);
        }
      }
    }

    const costUsd = addCost(addCost(securityCost, hygieneCost), mrCost);

    return {
      appName: app.appName,
      ok: true,
      costUsd,
      mr,
      report: {appName: app.appName, ledger, openFindings, hasSecuritySkill, laneFailures}
    };
  } finally {
    // A worktree is a full checkout — seven of them filled this machine's disk on
    // 2026-07-31. `finally` so a thrown lane, an exception building the ledger, or
    // anything else in the block still frees it; `worktreeGc` is the backstop for a
    // run that dies before even reaching this line.
    await deps.removeWorktree({repoPath: app.repoPath, dir, timeoutMs: deps.cfg.gitTimeoutMs});
  }
}
