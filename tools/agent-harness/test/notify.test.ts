import {describe, expect, test} from 'bun:test';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {notifyTelegram} from '../src/notify';

/** Runs notifyTelegram against an env file and returns the token the request URL carried (undefined = no request sent). */
async function tokenUsed(envContent: string): Promise<string | undefined> {
  const envFile = join(mkdtempSync(join(tmpdir(), 'notify-')), '.env');
  writeFileSync(envFile, envContent);
  let url: string | undefined;
  const fetchImpl = (async (u: string) => {
    url = u;
    return {ok: true};
  }) as unknown as typeof fetch;
  await notifyTelegram('hi', {envFile, fetchImpl});
  return url?.match(/\/bot(.*)\/sendMessage$/)?.[1];
}

describe('notify env parsing', () => {
  test('plain form', async () => {
    expect(await tokenUsed('TELEGRAM_BOT_TOKEN=abc123\n')).toBe('abc123');
  });

  test('export form', async () => {
    expect(await tokenUsed('export TELEGRAM_BOT_TOKEN=abc123\n')).toBe('abc123');
  });

  test('export form with extra whitespace', async () => {
    expect(await tokenUsed('  export   TELEGRAM_BOT_TOKEN = abc123  \n')).toBe('abc123');
  });

  test('quoted values, plain and export', async () => {
    expect(await tokenUsed('TELEGRAM_BOT_TOKEN="abc123"\n')).toBe('abc123');
    expect(await tokenUsed("export TELEGRAM_BOT_TOKEN='abc123'\n")).toBe('abc123');
  });

  test('commented-out line is not used', async () => {
    expect(await tokenUsed('# TELEGRAM_BOT_TOKEN=old\n# export TELEGRAM_BOT_TOKEN=old\n')).toBeUndefined();
    expect(await tokenUsed('#export TELEGRAM_BOT_TOKEN=old\nexport TELEGRAM_BOT_TOKEN=new\n')).toBe('new');
  });
});
