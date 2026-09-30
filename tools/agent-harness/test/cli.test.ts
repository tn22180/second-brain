import {describe, expect, test} from 'bun:test';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {formatVerdict, notifyTelegram} from '../src/notify';
import {makeRepo, sh, write} from './helpers';

const BIN = resolve(import.meta.dir, '../bin/harness.ts');
const run = (args: string[], env: Record<string, string>) => {
  const r = Bun.spawnSync([process.execPath, 'run', BIN, ...args], {env: {...process.env, ...env}});
  return {code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString()};
};
const tmp = () => mkdtempSync(join(tmpdir(), 'cli-'));

describe('harness CLI', () => {
  test('verify → ledger → decide → stats', () => {
    const t = tmp();
    const env = {AGENT_HARNESS_DB: join(t, 'l.db')};
    const repo = makeRepo();
    write(repo, 'src/a.js', 'module.exports = 3;\n');
    const cfile = join(t, 'c.json');
    writeFileSync(cfile, JSON.stringify({id: 'T-1', source: 'test', goal: 'g', repoPath: repo, baseSha: sh(repo, 'git', 'rev-parse', 'HEAD').trim(), allow: ['src/a.js'], verify: [{name: 'ok', cmd: ['true']}]}));
    const out = join(t, 'v.json');

    const v = run(['verify', cfile, '--out', out, '--claimed-done', '--no-notify'], env);
    expect(v.code).toBe(0);
    const verdict = JSON.parse(readFileSync(out, 'utf8'));
    expect(verdict.pass).toBe(true);

    expect(run(['decide', verdict.runId, 'approved'], env).code).toBe(0);
    expect(run(['decide', 'nope', 'approved'], env).code).toBe(1);
    const s = JSON.parse(run(['stats'], env).out);
    expect(s).toMatchObject({runs: 1, claimedDone: 1, falseDone: 0, approved: 1});

    // C3: open-mr asks the ledger, not the JSON file the agent could have written.
    expect(run(['check', verdict.runId, verdict.diffSha], env).code).toBe(0);
    expect(run(['check', verdict.runId, 'b'.repeat(40)], env).code).toBe(1);
    expect(run(['check', 'forged-run', verdict.diffSha], env).code).toBe(1);
  });

  test('check refuses a failed run even with the right sha', () => {
    const t = tmp();
    const env = {AGENT_HARNESS_DB: join(t, 'l.db')};
    const repo = makeRepo();
    const cfile = join(t, 'c.json');
    writeFileSync(cfile, JSON.stringify({id: 'T-3', source: 'test', goal: 'g', repoPath: repo, baseSha: sh(repo, 'git', 'rev-parse', 'HEAD').trim(), allow: ['src/a.js'], verify: [{name: 'ok', cmd: ['true']}]}));
    const out = join(t, 'v.json');
    expect(run(['verify', cfile, '--out', out, '--no-notify'], env).code).toBe(1);
    const v = JSON.parse(readFileSync(out, 'utf8'));
    expect(run(['check', v.runId, v.diffSha], env).code).toBe(1);
  });

  test('bad contract exits 2 and records nothing', () => {
    const t = tmp();
    const env = {AGENT_HARNESS_DB: join(t, 'l.db')};
    const cfile = join(t, 'c.json');
    writeFileSync(cfile, JSON.stringify({id: 'T-1', verify: []}));
    expect(run(['verify', cfile, '--out', join(t, 'v.json'), '--no-notify'], env).code).toBe(2);
    expect(JSON.parse(run(['stats'], env).out).runs).toBe(0);
  });

  test('failing verify exits 1', () => {
    const t = tmp();
    const repo = makeRepo();
    const cfile = join(t, 'c.json');
    writeFileSync(cfile, JSON.stringify({id: 'T-2', source: 'test', goal: 'g', repoPath: repo, baseSha: sh(repo, 'git', 'rev-parse', 'HEAD').trim(), allow: ['src/a.js'], verify: [{name: 'ok', cmd: ['true']}]}));
    expect(run(['verify', cfile, '--out', join(t, 'v.json'), '--no-notify'], {AGENT_HARNESS_DB: join(t, 'l.db')}).code).toBe(1);
  });
});

describe('notify', () => {
  test('format: bold run title, one short line, failures only', () => {
    const text = formatVerdict({
      contractId: 'seo-quota-t1', runId: 'r', at: 0, pass: false, diffSha: 'x', changed: ['a'],
      checks: [{name: 'scope', ok: true}, {name: 'jest', ok: false, detail: '2 failed <x>'}], costUsd: 0
    }, 'goal');
    expect(text).toBe('<b>seo-quota</b>\n❌ t1 FAIL — jest: 2 failed &lt;x&gt;');
  });
  test('format: pass is one line with counts', () => {
    const text = formatVerdict({
      contractId: 'seo-quota-t2', runId: 'r', at: 0, pass: true, diffSha: 'x', changed: ['a', 'b'],
      checks: [{name: 'scope', ok: true}, {name: 'stable', ok: true}], costUsd: 0
    }, 'goal');
    expect(text).toBe('<b>seo-quota</b>\n✅ t2 pass · 2/2 check · 2 file');
  });
  test('format: long detail is cut', () => {
    const text = formatVerdict({
      contractId: 'solo', runId: 'r', at: 0, pass: false, diffSha: 'x', changed: [],
      checks: [{name: 'jest', ok: false, detail: 'y'.repeat(500)}], costUsd: 0
    }, 'g');
    expect(text.startsWith('<b>solo</b>\n❌ FAIL — jest: ')).toBe(true);
    expect(text.length).toBeLessThan(160);
  });
  test('reads token from env file, false on HTTP error', async () => {
    const t = tmp();
    const envFile = join(t, '.env');
    writeFileSync(envFile, 'OTHER=1\nTELEGRAM_BOT_TOKEN="abc:def"\n');
    let url = '';
    let body = '';
    const ok = await notifyTelegram('hi', {
      envFile, chatId: '1',
      fetchImpl: (async (u: string, init: RequestInit) => { url = u; body = String(init.body); return new Response('{}', {status: 200}); }) as unknown as typeof fetch
    });
    expect(ok).toBe(true);
    expect(url).toBe('https://api.telegram.org/botabc:def/sendMessage');
    expect(JSON.parse(body).parse_mode).toBe('HTML');
    const bad = await notifyTelegram('hi', {envFile, chatId: '1', fetchImpl: (async () => new Response('', {status: 403})) as unknown as typeof fetch});
    expect(bad).toBe(false);
  });
  test('missing env file is false, not a throw', async () => {
    expect(await notifyTelegram('hi', {envFile: '/nonexistent/.env'})).toBe(false);
  });
});
