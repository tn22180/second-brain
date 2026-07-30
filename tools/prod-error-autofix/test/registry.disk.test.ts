import {describe, expect, test} from 'bun:test';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {buildConfig} from '../src/config';
import {APPS, appNames, listApps, resolveApp} from '../src/registry';

/**
 * Drift guard against the repos themselves. The registry is the one place this
 * project decides which repo a Slack alert belongs to and which branch a fix is
 * cut from; both are read off the app repos here, so a rename or a branch switch
 * fails the build instead of producing an MR against a branch that does not exist.
 */
const cfg = buildConfig({SLACK_BOT_TOKEN: 'x', SLACK_ERROR_CHANNEL_ID: 'x'});

function git(repoPath: string, args: string[]): string {
  const proc = Bun.spawnSync(['git', '-C', repoPath, ...args]);
  return new TextDecoder().decode(proc.stdout).trim();
}

describe('registry shape', () => {
  test('covers the five prod apps, one entry each', () => {
    expect(appNames()).toEqual(['SEO', 'BLOG', 'APC', 'AEO', 'IMG-OPT']);
    expect(new Set(APPS.map(a => a.repo)).size).toBe(APPS.length);
    expect(new Set(APPS.map(a => a.prodProject)).size).toBe(APPS.length);
  });

  test('lookup is case and whitespace tolerant', () => {
    expect(resolveApp(' blog ', cfg)?.repo).toBe('blogs');
    expect(resolveApp('img-opt', cfg)?.repo).toBe('avada-image-optimizer');
  });

  test('an app out of scope resolves to undefined, never a guess', () => {
    expect(resolveApp('JOY', cfg)).toBeUndefined();
    expect(resolveApp('', cfg)).toBeUndefined();
    expect(resolveApp('Avada Blog', cfg)).toBeUndefined();
  });
});

describe('registry matches the repos on disk', () => {
  test.each(listApps(cfg))('$appName', app => {
    expect(existsSync(app.repoPath)).toBe(true);

    // The branch a fix gets cut from must be the repo's actual default branch.
    const head = git(app.repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    expect(head).toBe(`refs/remotes/origin/${app.defaultBranch}`);

    // appName and prodProject come from the live alert wiring on that branch.
    const ref = `origin/${app.defaultBranch}:${app.alertHandler}`;
    const source = git(app.repoPath, ['show', ref]);
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain(`appName: '${app.appName}'`);
    expect(source).toContain(app.prodProject);

    // Root jest config is what testCmd relies on.
    expect(existsSync(join(app.repoPath, 'jest.config.js'))).toBe(true);
  });
});
