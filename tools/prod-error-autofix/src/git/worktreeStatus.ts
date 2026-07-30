import {spawnRunner, type Runner} from '../gcloud/run';

/**
 * What actually changed in the worktree — read from git, not from what the agent
 * says it did. The agent's own summary goes in the MR body; this decides whether
 * there is an MR at all.
 */

export interface ChangedFile {
  path: string;
  /** Porcelain status, e.g. `M`, `A`, `??`, `R`. */
  code: string;
  added: boolean;
}

export async function changedFiles(
  repoPath: string,
  runner: Runner = spawnRunner,
  timeoutMs = 60_000
): Promise<ChangedFile[]> {
  const res = await runner(
    ['git', '-C', repoPath, 'status', '--porcelain=v1', '--untracked-files=all'],
    timeoutMs
  );
  if (res.code !== 0) return [];
  return res.stdout
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const code = line.slice(0, 2).trim();
      let path = line.slice(3);
      // Renames come through as `old -> new`; the new path is what matters.
      const arrow = path.indexOf(' -> ');
      if (arrow >= 0) path = path.slice(arrow + 4);
      return {path, code, added: code === '??' || code.includes('A')};
    });
}

export async function diffStat(
  repoPath: string,
  runner: Runner = spawnRunner,
  timeoutMs = 60_000
): Promise<string> {
  const res = await runner(['git', '-C', repoPath, 'diff', '--stat'], timeoutMs);
  return res.code === 0 ? res.stdout.trim() : '';
}

export async function diffText(
  repoPath: string,
  runner: Runner = spawnRunner,
  timeoutMs = 60_000,
  maxChars = 20_000
): Promise<string> {
  const res = await runner(['git', '-C', repoPath, 'diff'], timeoutMs);
  return res.code === 0 ? res.stdout.slice(0, maxChars) : '';
}

/** Jest picks these up; so do we, to insist the fix came with a reproduce test. */
export function isTestFile(path: string): boolean {
  return /(^|\/)__tests__\//.test(path) || /\.(test|spec)\.[jt]sx?$/.test(path);
}

/**
 * Files an auto-opened MR must never touch.
 *
 * Dependency manifests are on the list deliberately: CI uses an immutable install,
 * so a `package.json` change without a matching lockfile fails the pipeline — and an
 * agent adding a dependency to fix a bug is a bigger decision than the bug itself.
 * Deploy and project config are excluded for the obvious reason.
 */
export const FORBIDDEN_PATTERNS: RegExp[] = [
  /(^|\/)package\.json$/,
  /(^|\/)(yarn\.lock|package-lock\.json|pnpm-lock\.yaml|bun\.lockb?)$/,
  /(^|\/)\.gitlab-ci\.yml$/,
  /(^|\/)firebase\.json$/,
  /(^|\/)\.firebaserc$/,
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)\.github\//,
  /(^|\/)node_modules\//
];

export function forbiddenTouches(paths: string[]): string[] {
  return paths.filter(p => FORBIDDEN_PATTERNS.some(re => re.test(p)));
}
