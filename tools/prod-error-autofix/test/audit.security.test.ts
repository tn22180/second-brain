import {describe, expect, test} from 'bun:test';
import {join} from 'node:path';
import {redactSecret, validateSecurity} from '../src/audit/securitySchema';
import {SECURITY_TOOLS, buildSecurityPrompt, runSecurityLane} from '../src/audit/securityLane';
import type {SecurityLaneInput} from '../src/audit/securityLane';
import type {ClaudeInvocation, ClaudeResult, ClaudeRunner} from '../src/agent/claudeCli';
import {
  FAKE_GITHUB_PAT,
  FAKE_GITLAB_PAT,
  FAKE_SHOPIFY_CUSTOM_TOKEN,
  FAKE_SHOPIFY_TOKEN,
  FAKE_SLACK_TOKEN,
  FAKE_STRIPE_KEY
} from './fixtures/fakeSecrets';

const WORKTREE = '/wt/seo';

function ok(text: string): ClaudeResult {
  return {
    ok: true,
    text,
    costUsd: 0.4,
    numTurns: 3,
    sessionId: 's1',
    permissionDenials: [],
    failure: undefined,
    detail: undefined
  };
}

function failed(failure: ClaudeResult['failure'], detail: string): ClaudeResult {
  return {
    ok: false,
    text: '',
    costUsd: undefined,
    numTurns: undefined,
    sessionId: undefined,
    permissionDenials: [],
    failure,
    detail
  };
}

const INPUT: SecurityLaneInput = {
  appName: 'SEO',
  worktreeDir: WORKTREE,
  model: 'claude-opus-5',
  timeoutMs: 600_000,
  brainSlice: undefined,
  // Hermetic: nothing here ever touches a real repo under projects/Falcon.
  fileExists: () => true
};

function finding(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    file: 'packages/functions/src/a.js',
    line: 12,
    severity: 'high',
    category: 'shop_scoping',
    title: 'query missing shopId',
    why: 'reads every shop',
    fix: 'add where(shopId)',
    ...over
  };
}

describe('validateSecurity — schema', () => {
  test('prose instead of JSON is a failed lane, not an empty one', () => {
    const r = validateSecurity('I looked at the repo and it seems fine.');
    expect(r.ok).toBe(false);
  });

  test('an empty array is a valid answer', () => {
    const r = validateSecurity('```json\n[]\n```');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(0);
  });

  test('a finding missing a field is rejected with the field named', () => {
    const r = validateSecurity('[{"file":"a.js","line":1}]');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const joined = r.errors.join(' ');
    expect(joined).toContain('severity');
    expect(joined).toContain('category');
    expect(joined).toContain('title');
    expect(joined).toContain('why');
    expect(joined).toContain('fix');
  });

  test('every bad field is named, not just the first', () => {
    const r = validateSecurity(JSON.stringify([finding({severity: 'critical', category: 'sqli', line: 0})]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(3);
  });

  test('a JSON object is not a valid answer — the lane answers with an array', () => {
    const r = validateSecurity(JSON.stringify(finding()));
    expect(r.ok).toBe(false);
  });

  // A model that restates the schema before answering puts the real answer second.
  test('the last array in the reply wins', () => {
    const text = [
      'Schema: [{"file":"...","line":0,"severity":"...","category":"...","title":"...","why":"...","fix":"..."}]',
      'Answer:',
      '```json',
      JSON.stringify([finding()]),
      '```'
    ].join('\n');
    const r = validateSecurity(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    expect(r.value[0]!.line).toBe(12);
  });
});

describe('redactSecret', () => {
  // The Telegram group is a wider audience than the repo. A secret finding says
  // where and what kind, never the value.
  test('a token-shaped string in a title is stripped', () => {
    expect(redactSecret(`key is ${FAKE_STRIPE_KEY}`)).toBe('key is <redacted>');
    expect(redactSecret(FAKE_SHOPIFY_TOKEN)).toBe('<redacted>');
    expect(redactSecret(FAKE_SHOPIFY_CUSTOM_TOKEN)).toBe('<redacted>');
    expect(redactSecret(FAKE_GITHUB_PAT)).toBe('<redacted>');
    expect(redactSecret(FAKE_SLACK_TOKEN)).toBe('<redacted>');
    expect(redactSecret('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def')).toBe('Authorization: <redacted>');
  });

  // These two separate on `-`, not `_`. git.avada.net issues the first kind and this
  // very tool authenticates with the second.
  test('hyphen-separated vendor keys are stripped too', () => {
    expect(redactSecret(FAKE_GITLAB_PAT)).toBe('<redacted>');
  });

  // A connection string hides a short password between punctuation the blob rules
  // skip; the host stays so the finding still says which database it is about.
  test('a URI password is stripped and the host survives', () => {
    expect(redactSecret('mongodb+srv://svc:pa55word@cluster0.mongodb.net/db')).toBe(
      'mongodb+srv://svc:<redacted>@cluster0.mongodb.net/db'
    );
    expect(redactSecret('sk-ant-api03-AbCdEfGhIjKl-mNoPqRs')).toBe('<redacted>');
  });

  test('a bare blob of 32+ hex or base64 characters is stripped', () => {
    expect(redactSecret('0123456789abcdef0123456789abcdef')).toBe('<redacted>');
    expect(redactSecret('token=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZg')).toBe('token=<redacted>');
  });

  test('ordinary prose is left alone', () => {
    expect(redactSecret('missing where(shopId) on the query')).toBe('missing where(shopId) on the query');
  });

  // Redaction that eats a file path makes the finding unactionable, which is how a
  // blunt rule gets switched off.
  test('paths, identifiers and urls survive', () => {
    const path = 'packages/functions/src/handlers/pubsub/handleProdErrorAlert.js';
    expect(redactSecret(path)).toBe(path);
    expect(redactSecret('createErrorAlertHandlerForShopScoping')).toBe('createErrorAlertHandlerForShopScoping');
    const url = 'https://gitlab.com/avada/seo/-/merge_requests/2204';
    expect(redactSecret(url)).toBe(url);
    // The `[_-]` separator widened the prefix rule; \b is what stops it eating these.
    const prose = 'risk-assessment-checklist for the task-management-service';
    expect(redactSecret(prose)).toBe(prose);
  });
});

describe('runSecurityLane', () => {
  test('the lane gets no write tools', () => {
    expect(SECURITY_TOOLS).not.toContain('Edit');
    expect(SECURITY_TOOLS).not.toContain('Write');
    expect(SECURITY_TOOLS.some(t => t.startsWith('Bash(gcloud'))).toBe(false);
    expect(SECURITY_TOOLS).toContain('Read');
  });

  test('the prompt names all five surfaces and demands a bare JSON array', () => {
    const prompt = buildSecurityPrompt(INPUT);
    for (const surface of ['shop_scoping', 'untrusted_input', 'secret', 'secret_in_log', 'authn']) {
      expect(prompt).toContain(surface);
    }
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('[]');
  });

  test('the agent runs in the worktree so the repo skills load', async () => {
    let seen: ClaudeInvocation | undefined;
    const claude: ClaudeRunner = async inv => {
      seen = inv;
      return ok('[]');
    };
    await runSecurityLane(INPUT, claude);
    expect(seen!.cwd).toBe(WORKTREE);
    expect(seen!.allowedTools).toEqual(SECURITY_TOOLS);
    expect(seen!.model).toBe('claude-opus-5');
  });

  test('a clean repo is an empty finding list, not a failure', async () => {
    const r = await runSecurityLane(INPUT, async () => ok('[]'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.findings).toHaveLength(0);
    expect(r.dropped).toBe(0);
  });

  test('a citation that does not resolve in the worktree is dropped', async () => {
    const claude: ClaudeRunner = async () =>
      ok(
        JSON.stringify([
          finding({file: 'src/real.js', line: 3}),
          finding({file: 'src/invented.js', line: 9, category: 'other'})
        ])
      );
    const r = await runSecurityLane({...INPUT, fileExists: p => p.endsWith('real.js')}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.file).toBe('src/real.js');
    expect(r.dropped).toBe(1);
  });

  test('existence is checked against the worktree, not the cwd of the process', async () => {
    const probed: string[] = [];
    const claude: ClaudeRunner = async () => ok(JSON.stringify([finding({file: 'src/real.js'})]));
    await runSecurityLane(
      {
        ...INPUT,
        fileExists: p => {
          probed.push(p);
          return true;
        }
      },
      claude
    );
    expect(probed).toContain(join(WORKTREE, 'src/real.js'));
  });

  test('a timeout is a named lane failure, not zero findings', async () => {
    const r = await runSecurityLane(INPUT, async () => failed('timeout', 'killed after 600000ms'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('timeout');
    expect(r.detail).toContain('600000');
  });

  test('prose back from the agent is a failed lane carrying the reason', async () => {
    const r = await runSecurityLane(INPUT, async () => ok('Nothing looked wrong to me.'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('invalid_answer');
    expect(r.errors.length).toBeGreaterThan(0);
  });

  // audit_findings.title is written to state.db. Redacting on the way to Telegram
  // would already have put the value on disk, so it happens at construction.
  test('a token quoted by the agent cannot survive into the returned findings', async () => {
    const token = FAKE_SHOPIFY_TOKEN;
    const claude: ClaudeRunner = async () =>
      ok(
        JSON.stringify([
          finding({
            category: 'secret',
            title: `hardcoded token ${token}`,
            why: `the literal ${token} is committed`,
            fix: `rotate ${token} and read it from env`
          })
        ])
      );
    const r = await runSecurityLane(INPUT, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.findings)).not.toContain(token);
    expect(r.findings[0]!.title).toContain('<redacted>');
    expect(r.findings[0]!.why).toContain('<redacted>');
    expect(r.findings[0]!.fix).toContain('<redacted>');
  });

  // blogs has no .claude/ at all. Reported, not papered over.
  test('a repo with no security skill is flagged rather than silently weaker', async () => {
    const withSkill = await runSecurityLane(INPUT, async () => ok('[]'));
    expect(withSkill.hasSecuritySkill).toBe(true);

    const without = await runSecurityLane(
      {...INPUT, fileExists: p => !p.includes('.claude')},
      async () => ok('[]')
    );
    expect(without.hasSecuritySkill).toBe(false);
  });

  test('the cost comes back so the report can label it', async () => {
    const r = await runSecurityLane(INPUT, async () => ok('[]'));
    expect(r.costUsd).toBe(0.4);
  });
});

describe('credential_exposure — the merchant token surface', () => {
  test('the category is accepted', () => {
    const res = validateSecurity(JSON.stringify([finding({category: 'credential_exposure'})]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]!.category).toBe('credential_exposure');
  });

  // The severity is the reason this category exists. renderReport drops findings by
  // severity once the Telegram cap bites, so a leaked accessToken the model scored
  // `low` would be cut before 800 hygiene hits it should have outranked.
  test('a low-scored credential leak is recorded as high anyway', () => {
    const res = validateSecurity(
      JSON.stringify([finding({category: 'credential_exposure', severity: 'low'})])
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]!.severity).toBe('high');
  });

  test('every other category keeps the severity the agent gave it', () => {
    const res = validateSecurity(JSON.stringify([finding({category: 'shop_scoping', severity: 'low'})]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]!.severity).toBe('low');
  });

  test('the prompt puts it first and names the tokens this fleet uses', () => {
    const prompt = buildSecurityPrompt(INPUT);
    expect(prompt.indexOf('credential_exposure')).toBeLessThan(prompt.indexOf('shop_scoping'));
    for (const name of ['accessToken', 'SHOPIFY_ACCESS_TOKEN_KEY', 'integrationKeys']) {
      expect(prompt).toContain(name);
    }
    // Without the precedence line the same leak lands in two categories on two mornings,
    // and findingFp (rule = category) reports it as new both times.
    expect(prompt).toContain('not `shop_scoping`');
  });
});
