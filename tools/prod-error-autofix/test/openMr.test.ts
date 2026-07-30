import {describe, expect, test} from 'bun:test';
import type {RunResult, Runner} from '../src/gcloud/run';
import {buildCreateMrUrl, buildMrBody, isCreateLinkOnly, openMr, parseCreateLink, parseMrUrl, remoteToWebUrl, type OpenMrInput} from '../src/git/openMr';
import {branchNameFor, linkNodeModules, parseWorktreeList, worktreeDirFor} from '../src/git/worktree';

const ok = (over: Partial<RunResult> = {}): RunResult => ({code: 0, stdout: '', stderr: '', timedOut: false, ...over});

/** Real shape of what GitLab writes on a push that created an MR. */
const PUSH_CREATED = `Enumerating objects: 13, done.
remote: Resolving deltas: 100% (4/4), completed with 4 local objects.
remote:
remote: View merge request for fix/prod-blog-1a2b3c:
remote:   https://gitlab.com/avada/blogs/-/merge_requests/1487
remote:
To gitlab.com:avada/blogs.git
 * [new branch]      HEAD -> fix/prod-blog-1a2b3c`;

/** What GitLab writes when no push option was used — a link to create one by hand. */
const PUSH_CREATE_LINK = `remote:
remote: To create a merge request for fix/prod-blog-1a2b3c, visit:
remote:   https://gitlab.com/avada/blogs/-/merge_requests/new?merge_request%5Bsource_branch%5D=fix%2Fprod-blog-1a2b3c
remote:
To gitlab.com:avada/blogs.git
 * [new branch]      HEAD -> fix/prod-blog-1a2b3c`;

describe('parseMrUrl', () => {
  test('picks the MR out of a real push', () => {
    expect(parseMrUrl(PUSH_CREATED)).toBe('https://gitlab.com/avada/blogs/-/merge_requests/1487');
  });

  test('a create-by-hand link is not a merge request', () => {
    // The distinction is the whole point: `/merge_requests/new?...` means the push
    // option did not take, and reporting it as an MR would be a lie in the thread.
    expect(parseMrUrl(PUSH_CREATE_LINK)).toBeUndefined();
    expect(isCreateLinkOnly(PUSH_CREATE_LINK)).toBe(true);
  });

  test('trailing punctuation is trimmed', () => {
    expect(parseMrUrl('see (https://gitlab.com/a/b/-/merge_requests/12).')).toBe(
      'https://gitlab.com/a/b/-/merge_requests/12'
    );
  });

  test('a push with no MR block yields nothing', () => {
    expect(parseMrUrl('To gitlab.com:avada/blogs.git\n   abc..def  HEAD -> branch')).toBeUndefined();
    expect(isCreateLinkOnly('nothing here')).toBe(false);
  });

  test('a self-hosted host works too', () => {
    expect(parseMrUrl('remote:  https://git.internal.avada.io/team/app/-/merge_requests/7')).toBe(
      'https://git.internal.avada.io/team/app/-/merge_requests/7'
    );
  });
});

describe('branch and worktree naming', () => {
  test('branch is namespaced, lowercased and attempt-aware', () => {
    expect(branchNameFor('BLOG', '1a2b3c', 1)).toBe('fix/prod-blog-1a2b3c');
    expect(branchNameFor('IMG-OPT', 'zz9', 2)).toBe('fix/prod-img-opt-zz9-a2');
  });

  test('worktree dirs are under the cache root, never in a repo', () => {
    const dir = worktreeDirFor('/home/u/.cache/prod-autofix/wt', 'blogs', '1a2b', 1);
    expect(dir).toBe('/home/u/.cache/prod-autofix/wt/blogs-1a2b');
    expect(dir).not.toContain('projects/Falcon');
  });

  test('worktree list is filtered to the dirs we own', () => {
    const stdout = [
      'worktree /Users/x/Documents/second-brain/projects/Falcon/blogs',
      'HEAD abc',
      '',
      'worktree /Users/x/.cache/prod-autofix/wt/blogs-1a2b',
      'HEAD def',
      '',
      'worktree /Users/x/Documents/second-brain/projects/Falcon/blogs-wt-docs',
      'HEAD ghi'
    ].join('\n');
    expect(parseWorktreeList(stdout, '/Users/x/.cache/prod-autofix/wt')).toEqual([
      '/Users/x/.cache/prod-autofix/wt/blogs-1a2b'
    ]);
  });
});

describe('openMr', () => {
  function input(over: Partial<OpenMrInput> = {}): OpenMrInput {
    return {
      worktreeDir: '/wt/blogs-1a2b',
      branch: 'fix/prod-blog-1a2b',
      baseBranch: 'master',
      title: 'fix(prod): [BLOG] 400 instead of 500 on a missing id',
      description: 'body',
      timeoutMs: 1000,
      ...over
    };
  }

  /** Scripts git by subcommand and records the argv of the push. */
  function gitRunner(over: {staged?: string; commitCode?: number; pushCode?: number; pushOutput?: string} = {}): {
    runner: Runner;
    pushArgs: () => string[];
  } {
    let pushArgs: string[] = [];
    const runner: Runner = async args => {
      const joined = args.join(' ');
      if (joined.includes('diff --cached')) return ok({stdout: over.staged ?? 'packages/functions/src/x.js\n'});
      if (joined.includes(' commit ')) return ok({code: over.commitCode ?? 0});
      if (joined.includes('rev-parse HEAD')) return ok({stdout: 'cafe1234\n'});
      if (joined.includes(' push ')) {
        pushArgs = args;
        return ok({code: over.pushCode ?? 0, stderr: over.pushOutput ?? PUSH_CREATED});
      }
      return ok();
    };
    return {runner, pushArgs: () => pushArgs};
  }

  test('a successful push returns the MR url and the fix sha', async () => {
    const {runner, pushArgs} = gitRunner();
    const res = await openMr(input(), runner);
    expect(res).toMatchObject({
      ok: true,
      mrUrl: 'https://gitlab.com/avada/blogs/-/merge_requests/1487',
      fixSha: 'cafe1234',
      pushed: true
    });
    const args = pushArgs().join(' ');
    expect(args).toContain('merge_request.create');
    expect(args).toContain('merge_request.target=master');
    expect(args).toContain('merge_request.remove_source_branch');
    expect(args).toContain('HEAD:refs/heads/fix/prod-blog-1a2b');
    // No GitLab API anywhere: there is no token on this machine.
    expect(args).not.toContain('glab');
    expect(args).not.toContain('api/v4');
  });

  test('a push that only offers a create link is not reported as an MR', async () => {
    const {runner} = gitRunner({pushOutput: PUSH_CREATE_LINK});
    const res = await openMr(input(), runner);
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('no_mr_url');
    // The branch is on the remote, so say so — the work is not lost.
    expect(res.pushed).toBe(true);
    expect(res.detail).toContain('did not take');
  });

  test('nothing staged is its own outcome', async () => {
    const {runner} = gitRunner({staged: '   \n'});
    const res = await openMr(input(), runner);
    expect(res.failure).toBe('nothing_to_commit');
  });

  test('a failed push reports the remote error and does not claim success', async () => {
    const {runner} = gitRunner({pushCode: 1, pushOutput: 'remote: GitLab: You are not allowed to push code'});
    const res = await openMr(input(), runner);
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('push_failed');
    expect(res.pushed).toBe(false);
    expect(res.detail).toContain('not allowed to push');
  });

  test('it refuses to push anything that is not a fix/prod branch', async () => {
    const {runner, pushArgs} = gitRunner();
    const res = await openMr(input({branch: 'master'}), runner);
    expect(res.failure).toBe('refused');
    expect(pushArgs()).toEqual([]);
  });

  test('it refuses when branch and base are the same', async () => {
    const {runner} = gitRunner();
    const res = await openMr(input({branch: 'fix/prod-x', baseBranch: 'fix/prod-x'}), runner);
    expect(res.failure).toBe('refused');
  });

  test('a long description is truncated rather than rejected by GitLab', async () => {
    const {runner, pushArgs} = gitRunner();
    await openMr(input({description: 'x'.repeat(9000)}), runner);
    const descArg = pushArgs().find(a => a.startsWith('merge_request.description='))!;
    expect(descArg.length).toBeLessThan(4200);
  });
});

describe('buildMrBody', () => {
  const body = buildMrBody({
    appName: 'BLOG',
    service: 'api',
    fingerprint: '1a2b3c',
    rootCause: 'getPreview passes an undefined id into a string method',
    mechanism: 'App Proxy calls arrive without id',
    citations: [{file: 'packages/functions/src/controllers/appProxyController.js', line: 99, why: 'reads id'}],
    evidence: [{logQuery: 'severity>=ERROR', matched: 44}],
    agentSummary: 'Answer 400 when id is absent.',
    risks: 'confirm the crawler path still works with an id',
    smokeLine: '164 tests, 0 failing · baseline 3 failing · reproduce test fails without the fix',
    logsUrl: 'https://console.cloud.google.com/logs/query?project=avada-blog-app',
    threadUrl: 'https://avada.slack.com/archives/C1/p123',
    attempt: 1
  });

  test('leads with why, and states the cause and the counts', () => {
    expect(body.startsWith('## Why')).toBe(true);
    expect(body).toContain('44 matching log entries');
    expect(body).toContain('appProxyController.js:99');
  });

  test('says plainly that no person has reviewed it', () => {
    expect(body).toContain('no');
    expect(body).toContain('reviewed by a person');
  });

  test('a retry says an earlier fix shipped and failed', () => {
    const retry = buildMrBody({
      appName: 'BLOG',
      service: undefined,
      fingerprint: 'f',
      rootCause: 'r',
      mechanism: 'm',
      citations: [],
      evidence: [],
      agentSummary: 's',
      risks: undefined,
      smokeLine: 'l',
      logsUrl: undefined,
      threadUrl: undefined,
      attempt: 2
    });
    expect(retry).toContain('attempt 2');
    expect(retry).toContain('survived it');
  });
});

describe('create-by-hand link', () => {
  test('the link GitLab printed is preferred', () => {
    expect(parseCreateLink(PUSH_CREATE_LINK)).toBe(
      'https://gitlab.com/avada/blogs/-/merge_requests/new?merge_request%5Bsource_branch%5D=fix%2Fprod-blog-1a2b3c'
    );
  });

  test('a push that created an MR has no create link', () => {
    expect(parseCreateLink(PUSH_CREATED)).toBeUndefined();
  });

  test('remote urls of every shape map to a web url', () => {
    expect(remoteToWebUrl('git@gitlab.com:avada/blogs.git')).toBe('https://gitlab.com/avada/blogs');
    expect(remoteToWebUrl('ssh://git@gitlab.com:2222/avada/blogs.git')).toBe('https://gitlab.com/avada/blogs');
    expect(remoteToWebUrl('https://gitlab.com/avada/blogs.git')).toBe('https://gitlab.com/avada/blogs');
    expect(remoteToWebUrl('https://oauth2:tok@gitlab.com/avada/blogs.git')).toBe('https://gitlab.com/avada/blogs');
    expect(remoteToWebUrl('git@gitlab.com:avada/seoon-team/falcon.git')).toBe('https://gitlab.com/avada/seoon-team/falcon');
  });

  test('a built link prefills source, target and title', () => {
    const url = buildCreateMrUrl('https://gitlab.com/avada/blogs', 'fix/prod-blog-1a2b', 'master', 'fix(prod): x');
    const params = new URL(url).searchParams;
    expect(url.startsWith('https://gitlab.com/avada/blogs/-/merge_requests/new?')).toBe(true);
    expect(params.get('merge_request[source_branch]')).toBe('fix/prod-blog-1a2b');
    expect(params.get('merge_request[target_branch]')).toBe('master');
    expect(params.get('merge_request[title]')).toBe('fix(prod): x');
    // The description is left out on purpose — it goes in the thread, not a URL.
    expect(params.get('merge_request[description]')).toBeNull();
  });

  test('openMr falls back to building the link when GitLab printed none', async () => {
    let pushArgs: string[] = [];
    const runner: Runner = async args => {
      const joined = args.join(' ');
      if (joined.includes('diff --cached')) return ok({stdout: 'a.js\n'});
      if (joined.includes('rev-parse HEAD')) return ok({stdout: 'cafe1234\n'});
      if (joined.includes('remote get-url')) return ok({stdout: 'git@gitlab.com:avada/blogs.git\n'});
      if (joined.includes(' push ')) {
        pushArgs = args;
        return ok({stderr: 'To gitlab.com:avada/blogs.git\n * [new branch] HEAD -> fix/prod-blog-1a2b'});
      }
      return ok();
    };
    const res = await openMr(
      {
        worktreeDir: '/wt',
        branch: 'fix/prod-blog-1a2b',
        baseBranch: 'master',
        title: 'fix(prod): x',
        description: 'body',
        timeoutMs: 1000
      },
      runner
    );
    expect(res.ok).toBe(false);
    expect(res.pushed).toBe(true);
    expect(res.createMrUrl).toContain('/-/merge_requests/new?');
    expect(res.createMrUrl).toContain('fix%2Fprod-blog-1a2b');
    expect(pushArgs.join(' ')).toContain('merge_request.create');
  });

  test('a failed push has no create link — there is no branch to open one for', async () => {
    const runner: Runner = async args => {
      const joined = args.join(' ');
      if (joined.includes('diff --cached')) return ok({stdout: 'a.js\n'});
      if (joined.includes(' push ')) return ok({code: 1, stderr: 'remote: GitLab: You are not allowed to push code'});
      return ok();
    };
    const res = await openMr(
      {worktreeDir: '/wt', branch: 'fix/prod-blog-1a2b', baseBranch: 'master', title: 't', description: 'b', timeoutMs: 1000},
      runner
    );
    expect(res.failure).toBe('push_failed');
    expect(res.createMrUrl).toBeUndefined();
  });
});

describe('linkNodeModules', () => {
  test('links the trees the worktree is missing', async () => {
    const present = new Set(['/repo/node_modules', '/repo/packages/functions/node_modules']);
    const made: [string, string][] = [];
    const res = await linkNodeModules(
      {repoPath: '/repo', worktreeDir: '/wt'},
      {
        existsSync: (p: string) => present.has(p),
        symlinkSync: (a: string, b: string) => {
          made.push([a, b]);
        }
      }
    );
    expect(res.linked).toEqual(['node_modules', 'packages/functions/node_modules']);
    expect(made[0]).toEqual(['/repo/node_modules', '/wt/node_modules']);
  });

  test('a tree already present in the worktree is left alone', async () => {
    const res = await linkNodeModules(
      {repoPath: '/repo', worktreeDir: '/wt'},
      {existsSync: () => true, symlinkSync: () => {}}
    );
    expect(res.linked).toEqual([]);
  });

  test('a symlink that cannot be made is reported, not thrown', async () => {
    const res = await linkNodeModules(
      {repoPath: '/repo', worktreeDir: '/wt'},
      {
        existsSync: (p: string) => p.startsWith('/repo'),
        symlinkSync: () => {
          throw new Error('EPERM');
        }
      }
    );
    expect(res.linked).toEqual([]);
    expect(res.missing.length).toBeGreaterThan(0);
  });
});
