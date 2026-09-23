import {describe, expect, test} from 'bun:test';
import type {ClaudeResult} from '../src/agent/claudeCli';
import {
  buildReviewPrompt,
  describeSecurity,
  parseDiff,
  parseReviewReply,
  redactSecret,
  scanDiff,
  securityGate
} from '../src/verify/security';
import {FAKE_GITHUB_PAT_ALT, FAKE_SLACK_TOKEN_ALT} from './fixtures/fakeSecrets';

/** Shapes a unified diff the way `git diff` writes one. */
function diff(file: string, hunk: {at?: number; lines: string[]}): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${hunk.at ?? 10},4 +${hunk.at ?? 10},4 @@`,
    ...hunk.lines
  ].join('\n');
}

const SRC = 'packages/functions/src/handlers/webhook.js';

describe('parseDiff', () => {
  test('separates added from removed and tracks the post-image line', () => {
    const d = diff(SRC, {at: 40, lines: [' const a = 1;', '-const b = 2;', '+const b = 3;', ' return b;']});
    const {added, removed} = parseDiff(d);
    expect(added).toEqual([{file: SRC, line: 41, text: 'const b = 3;'}]);
    expect(removed).toEqual([{file: SRC, line: 41, text: 'const b = 2;'}]);
  });

  test('the +++ header names the file, not the a/ side', () => {
    const {added} = parseDiff(diff('a/b/c.js', {lines: ['+x']}));
    expect(added[0]!.file).toBe('a/b/c.js');
  });

  test('walks multiple hunks and multiple files', () => {
    const d = [
      diff('one.js', {at: 5, lines: ['+first']}),
      diff('two.js', {at: 90, lines: [' ctx', '+second']})
    ].join('\n');
    const {added} = parseDiff(d);
    expect(added).toEqual([
      {file: 'one.js', line: 5, text: 'first'},
      {file: 'two.js', line: 91, text: 'second'}
    ]);
  });
});

describe('scanDiff — secrets', () => {
  test('blocks a Slack token literal', () => {
    const f = scanDiff(diff(SRC, {lines: [`+const t = '${FAKE_SLACK_TOKEN_ALT}';`]}));
    expect(f.map(x => x.rule)).toEqual(['slack-token']);
  });

  test('redacts the secret so it never reaches Slack or the incident file', () => {
    const f = scanDiff(diff(SRC, {lines: [`+const t = '${FAKE_SLACK_TOKEN_ALT}';`]}));
    expect(f[0]!.excerpt).not.toContain('8891234567');
    expect(f[0]!.excerpt).toContain('redacted');
  });

  test('a diff that DELETES a hardcoded key is not a finding', () => {
    // Scanning added and removed lines together would block exactly the cleanup we want.
    const f = scanDiff(diff(SRC, {lines: ["-const k = 'AKIAIOSFODNN7EXAMPLE';", '+const k = process.env.AWS_KEY;']}));
    expect(f).toEqual([]);
  });

  test('a private key block blocks', () => {
    expect(scanDiff(diff(SRC, {lines: ['+-----BEGIN RSA PRIVATE KEY-----']}))[0]!.rule).toBe('private-key');
  });

  test('a connection string with an inline password blocks', () => {
    const f = scanDiff(diff(SRC, {lines: ["+const url = 'postgres://admin:s3cr3tpw@10.0.0.4:5432/app';"]}));
    expect(f[0]!.rule).toBe('db-url-credentials');
    expect(f[0]!.excerpt).not.toContain('s3cr3tpw');
  });

  test('redactSecret keeps a short prefix so the finding is still identifiable', () => {
    expect(redactSecret('t = xoxb-abcdefghij', 'xoxb-abcdefghij')).toBe('t = xoxb-a…<redacted 15 chars>');
  });
});

describe('scanDiff — the false positives that would turn the gate off', () => {
  const clean = (lines: string[]) => expect(scanDiff(diff(SRC, {lines}))).toEqual([]);

  test('reading a secret from the environment is the correct pattern, not a finding', () => {
    clean(['+const token = process.env.SHOPIFY_API_SECRET;']);
  });

  test('a variable named password does not fire', () => {
    clean(['+const {password} = ctx.request.body;', "+if (!password) throw new Error('missing password');"]);
  });

  test('an ordinary Firestore query is not a finding', () => {
    clean(["+const snap = await db.collection('articles').where('shopId', '==', shopId).get();"]);
  });

  test('a normal await/try/catch fix is not a finding', () => {
    clean(['+  try {', '+    await syncArticle(shopId, articleId);', '+  } catch (e) {', '+    logger.error(e);', '+  }']);
  });

  test('the word eval inside a longer identifier does not fire', () => {
    clean(['+const value = retrieval.evaluate(input);', '+const x = obj.eval(1);']);
  });
});

describe('scanDiff — dangerous constructs', () => {
  test('turning off TLS verification blocks', () => {
    expect(scanDiff(diff(SRC, {lines: ['+const agent = new https.Agent({rejectUnauthorized: false});']}))[0]!.rule).toBe(
      'tls-verification-off'
    );
  });

  test('a shell command built by interpolation blocks', () => {
    expect(scanDiff(diff(SRC, {lines: ['+execSync(`rm -rf ${dir}`);']}))[0]!.rule).toBe('shell-interpolation');
  });

  test('an unconditional Firestore rule blocks', () => {
    expect(scanDiff(diff('firestore.rules', {lines: ['+      allow read, write: if true;']})).map(f => f.rule)).toContain(
      'firestore-rules-open'
    );
  });
});

describe('scanDiff — removed controls', () => {
  test('deleting the webhook signature check blocks', () => {
    // The realistic failure: the alert IS the signature check throwing, and the
    // cheapest way to stop the throw is to stop checking.
    const f = scanDiff(diff(SRC, {lines: ['-  if (!verifyWebhook(ctx)) return ctx.throw(401);', '+  // trust the caller']}));
    expect(f.map(x => x.rule)).toEqual(['removed-signature-check']);
  });

  test('deleting an authorization call blocks', () => {
    const f = scanDiff(diff(SRC, {lines: ['-  await checkPermission(ctx, "write");']}));
    expect(f[0]!.rule).toBe('removed-auth-check');
  });

  test('deleting a per-shop scope blocks — that is a tenant boundary', () => {
    const f = scanDiff(diff(SRC, {lines: ["-  .where('shopId', '==', shopId)"]}));
    expect(f[0]!.rule).toBe('removed-shop-scope');
  });

  test('a control that was rewritten rather than removed is not a finding', () => {
    // A legitimate fix reworks the guard; the line moves and the wording changes.
    const f = scanDiff(
      diff(SRC, {
        lines: [
          '-  if (!verifyWebhook(ctx)) return ctx.throw(401);',
          '+  const ok = verifyWebhook(ctx, {raw: ctx.request.rawBody});',
          '+  if (!ok) return ctx.throw(401);'
        ]
      })
    );
    expect(f).toEqual([]);
  });
});

describe('scanDiff — sensitive paths', () => {
  test('touching a credentials file blocks whatever the content is', () => {
    expect(scanDiff(diff('.env', {lines: ['+FOO=bar']}))[0]!.rule).toBe('touches-secrets-file');
  });

  test('touching CI blocks — that config runs with deploy credentials', () => {
    expect(scanDiff(diff('.gitlab-ci.yml', {lines: ['+  - echo hi']}))[0]!.rule).toBe('touches-ci');
  });

  test('an ordinary source file is not a sensitive path', () => {
    expect(scanDiff(diff(SRC, {lines: ['+const x = 1;']}))).toEqual([]);
  });
});

describe('parseReviewReply', () => {
  test('an empty findings list is a clean review', () => {
    expect(parseReviewReply('```json\n{"findings": []}\n```')).toEqual({findings: []});
  });

  test('a finding survives with its reasoning', () => {
    const r = parseReviewReply('{"findings":[{"rule":"idor","file":"a.js","line":7,"why":"any shop can read another shop"}]}');
    expect(r!.findings).toHaveLength(1);
    expect(r!.findings[0]!.rule).toBe('idor');
    expect(r!.findings[0]!.line).toBe(7);
  });

  test('a finding with no reasoning is dropped rather than blocking on nothing', () => {
    expect(parseReviewReply('{"findings":[{"rule":"x","file":"a.js"}]}')).toEqual({findings: []});
  });

  test('a reply with no findings key is malformed, NOT clean', () => {
    // The distinction that matters: undefined blocks, {findings: []} passes.
    expect(parseReviewReply('{"verdict": "looks fine to me"}')).toBeUndefined();
    expect(parseReviewReply('the patch is safe')).toBeUndefined();
  });
});

const OK_DIFF = diff(SRC, {lines: ['+  if (!article) return null;']});

function claudeReturning(over: Partial<ClaudeResult>) {
  return async (): Promise<ClaudeResult> => ({
    ok: true,
    text: '{"findings": []}',
    costUsd: 0.12,
    numTurns: 3,
    sessionId: 's',
    permissionDenials: [],
    failure: undefined,
    detail: undefined,
    ...over
  });
}

const input = {
  diff: OK_DIFF,
  repoPath: '/tmp/wt',
  appName: 'BLOG',
  rootCause: 'null article dereferenced',
  model: 'claude-opus-5',
  timeoutMs: 1000
};

describe('securityGate', () => {
  test('a clean diff and a clean review opens the way to the MR', async () => {
    const out = await securityGate(input, {claude: claudeReturning({})});
    expect(out.ok).toBe(true);
    expect(out.reviewed).toBe(true);
    expect(out.costUsd).toBe(0.12);
  });

  test('a pattern hit blocks without spending a model call', async () => {
    let called = false;
    const out = await securityGate(
      {...input, diff: diff(SRC, {lines: [`+const t = '${FAKE_GITHUB_PAT_ALT}';`]})},
      {
        claude: async () => {
          called = true;
          return {...(await claudeReturning({})())};
        }
      }
    );
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('patterns');
    expect(called).toBe(false);
    expect(out.costUsd).toBe(0);
  });

  test('a review finding blocks', async () => {
    const out = await securityGate(input, {
      claude: claudeReturning({text: '{"findings":[{"rule":"idor","file":"a.js","line":3,"why":"cross-shop read"}]}'})
    });
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('review');
    expect(out.findings[0]!.why).toBe('cross-shop read');
  });

  test('a review that did not run blocks — an unanswered question is not a pass', async () => {
    const out = await securityGate(input, {
      claude: claudeReturning({ok: false, failure: 'timeout', detail: 'killed after 1000ms', text: ''})
    });
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('review_unavailable');
  });

  test('an unparseable review blocks rather than being read as clean', async () => {
    const out = await securityGate(input, {claude: claudeReturning({text: 'looks fine to me'})});
    expect(out.ok).toBe(false);
    expect(out.failure).toBe('review_unavailable');
    // Still charged for it — the call happened.
    expect(out.costUsd).toBe(0.12);
  });

  test('the review runs read-only in the worktree', async () => {
    let seen: {allowedTools: string[]; cwd: string} | undefined;
    await securityGate(input, {
      claude: async inv => {
        seen = {allowedTools: inv.allowedTools, cwd: inv.cwd};
        return (await claudeReturning({})()) as ClaudeResult;
      }
    });
    expect(seen!.cwd).toBe('/tmp/wt');
    expect(seen!.allowedTools).not.toContain('Edit');
    expect(seen!.allowedTools).not.toContain('Write');
    expect(seen!.allowedTools.some(t => t.startsWith('Bash(git push'))).toBe(false);
  });
});

describe('buildReviewPrompt', () => {
  test('carries the intent and the whole diff', () => {
    const p = buildReviewPrompt(input);
    expect(p).toContain('null article dereferenced');
    expect(p).toContain('if (!article) return null;');
  });

  test('says out loud that an empty result is expected', () => {
    // Without this the model invents findings to look useful, and every fix parks.
    expect(buildReviewPrompt(input)).toContain('An empty findings list is the expected result');
  });
});

describe('describeSecurity', () => {
  test('lists each finding on its own line for the Slack reply', () => {
    const text = describeSecurity({
      ok: false,
      failure: 'patterns',
      findings: [
        {rule: 'slack-token', file: 'a.js', line: 3, excerpt: 'xoxb-…', why: 'Slack token literal'},
        {rule: 'touches-ci', file: '.gitlab-ci.yml', line: 0, excerpt: '', why: 'changes CI configuration'}
      ],
      reviewed: false,
      costUsd: 0,
      detail: 'x'
    });
    expect(text.split('\n')).toEqual([
      'slack-token · a.js:3 — Slack token literal',
      'touches-ci · .gitlab-ci.yml — changes CI configuration'
    ]);
  });
});
