import {describe, expect, test} from 'bun:test';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {formatVerdict, notifyTelegram} from '../src/notify';
import {makeRepo, write} from './helpers';

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
    writeFileSync(cfile, JSON.stringify({id: 'T-1', source: 'test', goal: 'g', repoPath: repo, allow: ['src/a.js'], verify: [{name: 'ok', cmd: ['true']}]}));
    const out = join(t, 'v.json');

    const v = run(['verify', cfile, '--out', out, '--claimed-done', '--no-notify'], env);
    expect(v.code).toBe(0);
    const verdict = JSON.parse(readFileSync(out, 'utf8'));
    expect(verdict.pass).toBe(true);

    expect(run(['decide', verdict.runId, 'approved'], env).code).toBe(0);
    expect(run(['decide', 'nope', 'approved'], env).code).toBe(1);
    const s = JSON.parse(run(['stats'], env).out);
    expect(s).toMatchObject({runs: 1, claimedDone: 1, falseDone: 0, approved: 1});
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
    writeFileSync(cfile, JSON.stringify({id: 'T-2', source: 'test', goal: 'g', repoPath: repo, allow: ['src/a.js'], verify: [{name: 'ok', cmd: ['true']}]}));
    expect(run(['verify', cfile, '--out', join(t, 'v.json'), '--no-notify'], {AGENT_HARNESS_DB: join(t, 'l.db')}).code).toBe(1);
  });
});

describe('notify', () => {
  test('format marks a failed verdict loudly', () => {
    const text = formatVerdict({
      contractId: 'FAL-1-g1', runId: 'r', at: 0, pass: false, diffSha: 'x', changed: ['a'],
      checks: [{name: 'scope', ok: true}, {name: 'jest', ok: false, detail: '2 failed'}], costUsd: 0
    }, 'goal');
    expect(text).toContain('❌ FAL-1-g1');
    expect(text).toContain('jest: 2 failed');
  });
  test('reads token from env file, false on HTTP error', async () => {
    const t = tmp();
    const envFile = join(t, '.env');
    writeFileSync(envFile, 'OTHER=1\nTELEGRAM_BOT_TOKEN="abc:def"\n');
    let url = '';
    const ok = await notifyTelegram('hi', {
      envFile, chatId: '1',
      fetchImpl: (async (u: string) => { url = u; return new Response('{}', {status: 200}); }) as unknown as typeof fetch
    });
    expect(ok).toBe(true);
    expect(url).toBe('https://api.telegram.org/botabc:def/sendMessage');
    const bad = await notifyTelegram('hi', {envFile, chatId: '1', fetchImpl: (async () => new Response('', {status: 403})) as unknown as typeof fetch});
    expect(bad).toBe(false);
  });
  test('missing env file is false, not a throw', async () => {
    expect(await notifyTelegram('hi', {envFile: '/nonexistent/.env'})).toBe(false);
  });
});
