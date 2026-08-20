import {describe, expect, test} from 'bun:test';
import {buildTriagePrompt, runTriage} from '../src/audit/triage';
import type {TriageFinding, TriageInput} from '../src/audit/triage';
import type {ClaudeInvocation, ClaudeResult, ClaudeRunner} from '../src/agent/claudeCli';

function ok(text: string): ClaudeResult {
  return {
    ok: true,
    text,
    costUsd: 0.1,
    numTurns: 2,
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

const THREE: TriageFinding[] = [
  {fp: 'a', file: 'packages/functions/src/const/default.js', line: 5, rule: 'no-unused-vars', message: "'X' is defined but never used"},
  {fp: 'b', file: 'packages/functions/src/legacy/helpers.js', line: 12, rule: 'no-unused-vars', message: "'Y' is defined but never used"},
  {fp: 'c', file: 'packages/assets/src/util.js', line: 3, rule: 'no-unused-vars', message: "'Z' is defined but never used"}
];

const INPUT: Omit<TriageInput, 'findings'> = {
  appName: 'SEO',
  worktreeDir: '/wt/seo',
  model: 'claude-sonnet-5',
  timeoutMs: 600_000,
  brainSlice: undefined
};

describe('runTriage', () => {
  test('only delete verdicts are eligible for the cleanup MR', async () => {
    const claude: ClaudeRunner = async () =>
      ok(
        JSON.stringify([
          {fp: 'a', verdict: 'delete', reason: 'no reference anywhere'},
          {fp: 'b', verdict: 'keep', reason: 'reached by a dynamic require'},
          {fp: 'c', verdict: 'unsure', reason: 'could not tell'}
        ])
      );
    const r = await runTriage({findings: THREE, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deletable.map(v => v.fp)).toEqual(['a']);
  });

  // A verdict for a finding that was never sent is a hallucinated id.
  test('verdicts for unknown fingerprints are discarded', async () => {
    const claude: ClaudeRunner = async () => ok('[{"fp":"zzz","verdict":"delete","reason":"x"}]');
    const r = await runTriage({findings: THREE, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deletable).toHaveLength(0);
    expect(r.verdicts.some(v => v.fp === 'zzz')).toBe(false);
  });

  // A missing verdict must never default to delete.
  test('a finding the agent skipped is unsure, not deletable', async () => {
    const claude: ClaudeRunner = async () => ok('[{"fp":"a","verdict":"delete","reason":"x"}]');
    const r = await runTriage({findings: THREE, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdicts.find(v => v.fp === 'b')!.verdict).toBe('unsure');
    expect(r.deletable.map(v => v.fp)).toEqual(['a']);
  });

  test('every input finding has exactly one entry in verdicts', async () => {
    const claude: ClaudeRunner = async () => ok('[{"fp":"a","verdict":"delete","reason":"x"}]');
    const r = await runTriage({findings: THREE, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdicts.map(v => v.fp).sort()).toEqual(['a', 'b', 'c']);
  });

  test('a verdict outside the enum is treated as no verdict, not trusted verbatim', async () => {
    const claude: ClaudeRunner = async () => ok('[{"fp":"a","verdict":"maybe-delete","reason":"x"}]');
    const r = await runTriage({findings: THREE, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdicts.find(v => v.fp === 'a')!.verdict).toBe('unsure');
  });

  test('prose instead of JSON is a named lane failure, not "nothing to delete"', async () => {
    const claude: ClaudeRunner = async () => ok('I looked at the findings and none of them look dead to me.');
    const r = await runTriage({findings: THREE, ...INPUT}, claude);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('invalid_answer');
  });

  test('a timeout is a named failure', async () => {
    const claude: ClaudeRunner = async () => failed('timeout', 'killed after 600000ms');
    const r = await runTriage({findings: THREE, ...INPUT}, claude);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('timeout');
    expect(r.detail).toContain('600000');
  });

  test('the lane gets read-only tools, no Edit or Write', async () => {
    let seen: ClaudeInvocation | undefined;
    const claude: ClaudeRunner = async inv => {
      seen = inv;
      return ok('[]');
    };
    await runTriage({findings: THREE, ...INPUT}, claude);
    expect(seen!.allowedTools).not.toContain('Edit');
    expect(seen!.allowedTools).not.toContain('Write');
    expect(seen!.cwd).toBe('/wt/seo');
    expect(seen!.model).toBe('claude-sonnet-5');
  });

  test('an empty finding list sends no verdicts and no fingerprints to guess at', async () => {
    let seen: ClaudeInvocation | undefined;
    const claude: ClaudeRunner = async inv => {
      seen = inv;
      return ok('[]');
    };
    const r = await runTriage({findings: [], ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdicts).toHaveLength(0);
    expect(seen!.prompt).toContain('```json\n[]\n```');
  });

  test('the prompt hands over every fingerprint and asks about dynamic reach', () => {
    const prompt = buildTriagePrompt({findings: THREE, ...INPUT});
    expect(prompt).toContain('"a"');
    expect(prompt).toContain('"b"');
    expect(prompt).toContain('"c"');
    expect(prompt).toContain('require(');
    expect(prompt).toContain('re-export');
  });
});

// no-undef means a symbol is used with nothing importing it. The repair is an
// import, never a deletion, so a delete vote on one must not reach task 8's
// cleanup MR — it would delete the line that USES the symbol.
test('a delete verdict on a no-undef finding is never deletable', async () => {
  const findings: TriageFinding[] = [
    {fp: 'u1', file: 'packages/functions/src/a.js', line: 3, rule: 'no-undef', message: "'shopify' is not defined"},
    {fp: 'd1', file: 'packages/functions/src/b.js', line: 9, rule: 'no-unused-vars', message: "'X' is defined but never used"}
  ];
  const claude: ClaudeRunner = async () =>
    ok(JSON.stringify([
      {fp: 'u1', verdict: 'delete', reason: 'looks unused to me'},
      {fp: 'd1', verdict: 'delete', reason: 'no reference anywhere'}
    ]));
  const r = await runTriage({findings, ...INPUT}, claude);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.deletable.map(v => v.fp)).toEqual(['d1']);
  // Still reported, just not actionable.
  expect(r.verdicts.map(v => v.fp).sort()).toEqual(['d1', 'u1']);
});
