import {describe, expect, test} from 'bun:test';
import {buildConfig} from '../src/config';
import {resolveApp} from '../src/registry';
import {measureBaseline} from '../src/verify/smoke';

/**
 * Runs a real jest suite in a real repo, read-only. Off by default:
 *
 *   AUTOFIX_INTEGRATION=1 bun test ./test/integration.jest.test.ts
 *
 * APC is used because it is the smallest suite of the five (5 files, ~15s). It also
 * happens to have a failing test on a clean tree, which is exactly the case the
 * baseline exists for — a single jest run would call that a regression on every job.
 */
const enabled = process.env.AUTOFIX_INTEGRATION === '1';
const cfg = buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'});
const it = enabled ? test : test.skip;

describe('jest baseline (integration)', () => {
  it(
    'measures a real baseline on APC',
    async () => {
      const app = resolveApp('APC', cfg)!;
      const base = await measureBaseline({
        repoPath: app.repoPath,
        testCmd: app.testCmd,
        timeoutMs: cfg.timeouts.jestMs
      });
      if (!base.ok) throw new Error(`baseline failed to run: ${base.detail}`);
      console.log(`  APC baseline: ${base.failures.length} failing`);
      for (const f of base.failures) console.log(`    ${f}`);
      // Keys must be repo-relative, or a baseline taken here would never match a
      // run inside a worktree at a different path.
      for (const f of base.failures) {
        expect(f.startsWith('/')).toBe(false);
        expect(f).toContain('::');
      }
    },
    300_000
  );
});
