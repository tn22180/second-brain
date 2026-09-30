import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkVerdict, stagedTreeSha} from '../scripts/lib/verdict.mjs';
import {git} from '../scripts/lib/git.mjs';

const good = {pass: true, diffSha: 'a'.repeat(40), contractId: 'FAL-1-g1', runId: 'r'};

test('accepts a passing verdict for the same staged tree', () => {
  assert.deepEqual(checkVerdict(good, 'a'.repeat(40)), {ok: true});
});
test('rejects a missing verdict', () => {
  assert.equal(checkVerdict(undefined, 'x').failure, 'unverified');
});
test('rejects a failed verdict', () => {
  assert.equal(checkVerdict({...good, pass: false}, good.diffSha).failure, 'verify_failed');
});
test('rejects a verdict whose diffSha does not match', () => {
  assert.equal(checkVerdict(good, 'b'.repeat(40)).failure, 'diff_changed');
});
test('rejects a verdict with a malformed sha', () => {
  assert.equal(checkVerdict({...good, diffSha: ''}, '').failure, 'unverified');
});
test('pass must be literally true', () => {
  assert.equal(checkVerdict({...good, pass: 'true'}, good.diffSha).failure, 'verify_failed');
});

test('stagedTreeSha is the write-tree of the index', async () => {
  const d = mkdtempSync(join(tmpdir(), 'jf-'));
  const sh = (...a) => execFileSync('git', ['-C', d, ...a]).toString().trim();
  sh('init', '-q', '-b', 'master');
  writeFileSync(join(d, 'a.js'), 'x = "é漢"\n');
  sh('add', 'a.js');
  assert.equal(await stagedTreeSha(d, git), sh('write-tree'));
});

import {ledgerCheck} from '../scripts/lib/verdict.mjs';
import {outOfScope, presentPaths} from '../scripts/lib/git.mjs';

// A stand-in for `harness check`: exits 0 only for run "good" + sha "a…a".
const fakeBin = () => {
  const d = mkdtempSync(join(tmpdir(), 'jfbin-'));
  const f = join(d, 'harness.mjs');
  writeFileSync(f, 'const [, , cmd, run, sha] = process.argv; process.exit(cmd === "check" && run === "good" && sha === "a".repeat(40) ? 0 : 1);\n');
  return f;
};

test('ledgerCheck trusts the ledger, not the verdict file', async () => {
  const bin = fakeBin();
  assert.deepEqual(await ledgerCheck('good', 'a'.repeat(40), {bun: process.execPath, bin}), {ok: true});
  assert.equal((await ledgerCheck('forged', 'a'.repeat(40), {bun: process.execPath, bin})).failure, 'unverified');
});
test('ledgerCheck fails closed when the harness is missing', async () => {
  const r = await ledgerCheck('good', 'a'.repeat(40), {bun: process.execPath, bin: '/nonexistent/harness.ts'});
  assert.equal(r.ok, false);
});

test('outOfScope honours dir entries ending with /', () => {
  assert.deepEqual(outOfScope(['src/__tests__/a.test.js', 'src/b.js'], ['src/__tests__/']), ['src/b.js']);
  assert.deepEqual(outOfScope(['src/__testsX/a.js'], ['src/__tests__/']), ['src/__testsX/a.js']);
});

test('presentPaths keeps existing or tracked entries, drops allowed-but-absent ones', async () => {
  const d = mkdtempSync(join(tmpdir(), 'jfp-'));
  const sh = (...a) => execFileSync('git', ['-C', d, ...a]).toString();
  sh('init', '-q', '-b', 'master');
  writeFileSync(join(d, 'gone.js'), '1');
  writeFileSync(join(d, 'here.js'), '1');
  sh('add', '-A');
  sh('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'i');
  execFileSync('rm', [join(d, 'gone.js')]);
  assert.deepEqual(await presentPaths(d, ['here.js', 'gone.js', 'never.js'], git), ['here.js', 'gone.js']);
});
