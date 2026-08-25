import {describe, expect, test} from 'bun:test';
import {buildTriagePrompt, runTriage, TRIAGE_BATCH_SIZE} from '../src/audit/triage';
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

function makeFindings(n: number): TriageFinding[] {
  return Array.from({length: n}, (_, i) => ({
    fp: `f${i}`,
    file: `packages/functions/src/gen${i}.js`,
    line: i + 1,
    rule: 'no-unused-vars',
    message: `'X${i}' is defined but never used`
  }));
}

/** The findings JSON block only — cuts off before "## Answer", whose fixed
 * template line (`{"fp": "<the fp from above>", ...}` — see buildTriagePrompt)
 * would otherwise count as one more finding that was never actually sent. */
function findingsBlock(prompt: string): string {
  return prompt.slice(0, prompt.indexOf('## Answer'));
}

function fpCountInPrompt(prompt: string): number {
  return (findingsBlock(prompt).match(/"fp":/g) ?? []).length;
}

function fpsInPrompt(prompt: string): string[] {
  return [...findingsBlock(prompt).matchAll(/"fp":\s*"([^"]+)"/g)].map(m => m[1]!);
}

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

// Reproduces the measured failure: 851 findings handed to one `claude -p` call
// died with "killed after 360000ms" and lost every verdict. Batching must turn
// that one call into several, none of them anywhere near 851 findings wide.
describe('batching (measured failure: 851 findings, one call, killed after 360000ms)', () => {
  test('851 findings are split across several calls, none over the batch size', async () => {
    const findings = makeFindings(851);
    const calls: ClaudeInvocation[] = [];
    const claude: ClaudeRunner = async inv => {
      calls.push(inv);
      return ok('[]');
    };
    const r = await runTriage({findings, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.length).toBe(Math.ceil(851 / TRIAGE_BATCH_SIZE));
    for (const c of calls) expect(fpCountInPrompt(c.prompt)).toBeLessThanOrEqual(TRIAGE_BATCH_SIZE);
  });

  test('every input finding still gets exactly one verdict, in input order, no duplicates', async () => {
    const findings = makeFindings(851);
    const claude: ClaudeRunner = async () => ok('[]');
    const r = await runTriage({findings, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdicts.map(v => v.fp)).toEqual(findings.map(f => f.fp));
    expect(new Set(r.verdicts.map(v => v.fp)).size).toBe(851);
  });

  test('a small run (3 findings) still makes exactly one call', async () => {
    const calls: ClaudeInvocation[] = [];
    const claude: ClaudeRunner = async inv => {
      calls.push(inv);
      return ok('[]');
    };
    await runTriage({findings: THREE, ...INPUT}, claude);
    expect(calls.length).toBe(1);
  });

  test('one bad batch degrades to unsure for that batch only — the rest survive', async () => {
    const findings = makeFindings(TRIAGE_BATCH_SIZE * 3);
    let callIndex = -1;
    const claude: ClaudeRunner = async inv => {
      callIndex++;
      if (callIndex === 1) return failed('timeout', 'killed after 360000ms');
      // Every finding in every OK batch votes delete, so a surviving batch is
      // trivially distinguishable from one that fell back to unsure.
      const fps = fpsInPrompt(inv.prompt);
      return ok(JSON.stringify(fps.map(fp => ({fp, verdict: 'delete', reason: 'gone'}))));
    };
    const r = await runTriage({findings, ...INPUT}, claude);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batchFailures).toHaveLength(1);
    expect(r.batchFailures![0]!.failure).toBe('timeout');

    const batch2 = findings.slice(TRIAGE_BATCH_SIZE, TRIAGE_BATCH_SIZE * 2);
    for (const f of batch2) {
      expect(r.verdicts.find(v => v.fp === f.fp)!.verdict).toBe('unsure');
    }
    const batch1 = findings.slice(0, TRIAGE_BATCH_SIZE);
    const batch3 = findings.slice(TRIAGE_BATCH_SIZE * 2);
    for (const f of [...batch1, ...batch3]) {
      expect(r.verdicts.find(v => v.fp === f.fp)!.verdict).toBe('delete');
    }
    expect(r.deletable.map(v => v.fp).sort()).toEqual([...batch1, ...batch3].map(f => f.fp).sort());
  });

  test('every batch failing is still a named lane failure, not a silent "nothing to delete"', async () => {
    const findings = makeFindings(TRIAGE_BATCH_SIZE * 2 + 5);
    const claude: ClaudeRunner = async () => failed('timeout', 'killed after 360000ms');
    const r = await runTriage({findings, ...INPUT}, claude);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure).toBe('timeout');
    expect(r.batchFailures).toHaveLength(3);
    expect(r.totalBatches).toBe(3);
    expect(r.detail).toContain('3/3');
  });
});

describe('the app deadline', () => {
  /** A clock that advances a fixed amount every time the lane reads it. */
  function clock(startMs: number, stepMs: number) {
    let t = startMs;
    return () => {
      const now = t;
      t += stepMs;
      return now;
    };
  }

  test('no deadline means every batch runs — the shape that took ~48 hours', async () => {
    let calls = 0;
    const claude: ClaudeRunner = async () => {
      calls++;
      return ok('[]');
    };
    await runTriage({...INPUT, findings: makeFindings(TRIAGE_BATCH_SIZE * 4)}, claude);
    expect(calls).toBe(4);
  });

  test('a passed deadline stops the lane between batches', async () => {
    let calls = 0;
    const claude: ClaudeRunner = async () => {
      calls++;
      return ok('[]');
    };
    // Reads 1000, 2000, 3000 … so batch 0 and 1 start and batch 2 does not.
    const res = await runTriage(
      {
        ...INPUT,
        findings: makeFindings(TRIAGE_BATCH_SIZE * 4),
        deadlineMs: 3000,
        now: clock(1000, 1000)
      },
      claude
    );

    expect(calls).toBe(2);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.stoppedAtDeadline).toEqual({atBatch: 2, untriaged: TRIAGE_BATCH_SIZE * 2});
  });

  test('what it never reached comes back as unsure, never as a missing verdict', async () => {
    const claude: ClaudeRunner = async () => ok('[]');
    const findings = makeFindings(TRIAGE_BATCH_SIZE * 3);
    const res = await runTriage(
      {...INPUT, findings, deadlineMs: 2000, now: clock(1000, 1000)},
      claude
    );

    if (!res.ok) throw new Error('unreachable');
    // Every finding still has a verdict: a dropped one would silently look deletable
    // to nothing and reviewable by nobody.
    expect(res.verdicts).toHaveLength(findings.length);
    const untriaged = res.verdicts.filter(v => v.reason === 'triage stopped at the app deadline');
    expect(untriaged).toHaveLength(TRIAGE_BATCH_SIZE * 2);
    expect(untriaged.every(v => v.verdict === 'unsure')).toBe(true);
    // Stopped early is not eligible for deletion.
    expect(res.deletable).toHaveLength(0);
  });

  test('a deadline already passed before the first batch runs nothing at all', async () => {
    let calls = 0;
    const claude: ClaudeRunner = async () => {
      calls++;
      return ok('[]');
    };
    const res = await runTriage(
      {...INPUT, findings: makeFindings(10), deadlineMs: 500, now: clock(1000, 1000)},
      claude
    );

    expect(calls).toBe(0);
    if (!res.ok) throw new Error('unreachable');
    // Not a lane failure: the lane did exactly what it was told, and the count says so.
    expect(res.stoppedAtDeadline).toEqual({atBatch: 0, untriaged: 10});
  });
});
