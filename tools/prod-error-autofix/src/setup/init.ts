import {chmodSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {resolveClaudeBin} from '../agent/claudeCli';
import {appNames} from '../registry';
import {DAEMON_TOOLS, installHint, renderPlist, resolvePlistInput} from './plist';
import {readExample} from './doctor';

/**
 * Turns a fresh checkout into a runnable install.
 *
 * Everything here is idempotent and refuses to overwrite: an `init` that clobbered a
 * filled-in `.env` or a brain file LEARN had been writing to for weeks would cost more
 * than it saved. Re-running reports what already exists and writes only the gaps.
 */

export interface InitInput {
  projectRoot: string;
  cacheRoot: string;
  brainRoot: string;
  label: string;
  serviceAccount: string | undefined;
  env: Record<string, string | undefined>;
  /** Overwrite the plist even though it exists. The other files are never overwritten. */
  forcePlist: boolean;
}

export interface InitStep {
  path: string;
  action: 'created' | 'kept' | 'skipped';
  note: string;
}

export interface InitResult {
  steps: InitStep[];
  plistPath: string;
  label: string;
  /** Printed after the steps: what the operator still has to do by hand. */
  next: string[];
}

/** A per-app brain file starts empty of claims on purpose — LEARN earns them. */
export function appBrainSkeleton(appName: string): string {
  return [
    `# ${appName}`,
    '',
    'What an agent needs to know about this app that it cannot read off the code in the time it has.',
    'Keep it short: every line here is loaded into every job for this app, and the whole slice is',
    'capped (`autofix brain budget`).',
    '',
    '## Conventions',
    '',
    '- _(nothing learned yet)_',
    '',
    '## Learned',
    '',
    '## Incident history',
    ''
  ].join('\n');
}

export function indexSkeleton(): string {
  return ['# Incident index', '', '<!-- LEARN appends below this line -->', ''].join('\n');
}

export function candidatesSkeleton(): string {
  return [
    '# Candidates',
    '',
    'Claims LEARN inferred but has not earned yet. Promote with `autofix brain promote <n>`;',
    'a claim needs two distinct fingerprints before it can move into an app file.',
    '',
    '<!-- LEARN appends below this line -->',
    ''
  ].join('\n');
}

function write(steps: InitStep[], path: string, content: string, opts: {mode?: number; force?: boolean} = {}): void {
  if (existsSync(path) && !opts.force) {
    steps.push({path, action: 'kept', note: 'đã có, không đụng'});
    return;
  }
  mkdirSync(join(path, '..'), {recursive: true});
  writeFileSync(path, content, 'utf8');
  if (opts.mode !== undefined) chmodSync(path, opts.mode);
  steps.push({path, action: 'created', note: opts.mode === 0o600 ? 'chmod 600' : ''});
}

export function initInstall(input: InitInput): InitResult {
  const steps: InitStep[] = [];
  const next: string[] = [];

  for (const dir of [input.cacheRoot, join(input.cacheRoot, 'wt'), join(input.cacheRoot, 'jobs')]) {
    if (existsSync(dir)) {
      steps.push({path: dir, action: 'kept', note: ''});
    } else {
      mkdirSync(dir, {recursive: true});
      steps.push({path: dir, action: 'created', note: ''});
    }
  }

  const envPath = join(input.projectRoot, '.env');
  const example = readExample(input.projectRoot);
  if (!example) {
    steps.push({path: envPath, action: 'skipped', note: 'không thấy .env.example'});
  } else {
    write(steps, envPath, example, {mode: 0o600});
    if (steps[steps.length - 1]!.action === 'created') {
      next.push(`điền SLACK_BOT_TOKEN và SLACK_ERROR_CHANNEL_ID trong ${envPath}`);
    }
  }

  write(steps, join(input.brainRoot, 'index.md'), indexSkeleton());
  write(steps, join(input.brainRoot, 'candidates.md'), candidatesSkeleton());
  for (const app of appNames()) {
    write(steps, join(input.brainRoot, 'apps', `${app}.md`), appBrainSkeleton(app));
  }
  // CORE.md and patterns.md ship with the repo — they are the agent's instructions, not
  // per-install state. A missing one is a broken checkout, not something to generate.
  for (const f of ['CORE.md', 'patterns.md']) {
    const path = join(input.brainRoot, f);
    if (!existsSync(path)) {
      steps.push({path, action: 'skipped', note: 'THIẾU — checkout hỏng, không tự sinh được'});
      next.push(`khôi phục ${f} từ git`);
    }
  }

  const plistPath = join(input.projectRoot, 'launchd', `${input.label}.plist`);
  const plist = renderPlist(
    resolvePlistInput({
      projectRoot: input.projectRoot,
      cacheRoot: input.cacheRoot,
      label: input.label,
      serviceAccount: input.serviceAccount,
      env: input.env,
      bunBin: input.env.AUTOFIX_BUN_BIN || process.execPath,
      // Resolved against the operator's own PATH, but only these names — the plist gets
      // their directories, never the whole shell PATH.
      toolPaths: [
        resolveClaudeBin(input.env),
        ...DAEMON_TOOLS.map(t => Bun.which(t, {PATH: input.env.PATH}) ?? '')
      ].filter(Boolean)
    })
  );
  write(steps, plistPath, plist, {force: input.forcePlist});

  if (!input.serviceAccount) {
    next.push(
      'cân nhắc tạo service account cho daemon (logging.viewer + cloudfunctions.viewer + run.viewer) ' +
        'rồi chạy lại `autofix init --service-account <email> --force-plist` — credential user hết hạn theo session policy, daemon không trả lời prompt reauth được'
    );
  }
  next.push('`autofix doctor` để soi lại toàn bộ');
  next.push(`nạp job:\n${installHint(input.label, plistPath)}`);

  return {steps, plistPath, label: input.label, next};
}

export function formatInit(result: InitResult): string {
  const lines = ['install:'];
  for (const s of result.steps) {
    const mark = s.action === 'created' ? '+' : s.action === 'kept' ? '=' : '!';
    lines.push(`  ${mark} ${s.path}${s.note ? `  (${s.note})` : ''}`);
  }
  lines.push('', 'còn phải làm tay:');
  for (const n of result.next) lines.push(`  - ${n}`);
  return lines.join('\n');
}
