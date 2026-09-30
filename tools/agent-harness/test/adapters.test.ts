import {describe, expect, test} from 'bun:test';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {childEnv, readEnvFile, startProc, superviseWith} from '../src/adapters';

const tmp = () => mkdtempSync(join(tmpdir(), 'adapt-'));
const until = async (f: () => boolean) => {
  for (let i = 0; i < 200 && !f(); i++) await new Promise(r => setTimeout(r, 10));
};

describe('adapters', () => {
  test('startProc logs output to a file and exposes tail + exit code', async () => {
    const d = tmp();
    const p = startProc(['sh', '-c', 'echo first; echo second >&2; exit 3'], d, join(d, 'n.log'));
    await until(() => p.exited());
    expect(p.exitCode()).toBe(3);
    expect(p.tail()).toContain('first');
    expect(p.tail()).toContain('second');
  });

  test('kill stops a running process', async () => {
    const d = tmp();
    const p = startProc(['sleep', '30'], d, join(d, 'n.log'));
    expect(p.exited()).toBe(false);
    p.kill();
    await until(() => p.exited());
    expect(p.exited()).toBe(true);
  });

  test('env file: KEY=v, export KEY=v, quotes, comments', () => {
    const f = join(tmp(), '.env');
    writeFileSync(f, '# c\nA=1\nexport B="two"\nC=\'three\'\n\nbad line\n');
    expect(readEnvFile(f)).toEqual({A: '1', B: 'two', C: 'three'});
  });

  test('child env drops metered API keys so cc stays on the subscription login', () => {
    const env = childEnv({PATH: '/bin', ANTHROPIC_API_KEY: 'x', ANTHROPIC_AUTH_TOKEN: 'y', CLAUDECODE: '1', HOME: '/h'});
    expect(env).toEqual({PATH: '/bin', HOME: '/h'});
  });

  test('supervise: parses jev JSON; any failure means keep_waiting (the wall clock is the backstop)', async () => {
    const good = await superviseWith(['sh', '-c', 'cat >/dev/null; echo \'{"action":"nudge","message":"go"}\''], {}, {goal: 'g', tail: 't', elapsed_s: 1, quiet_s: 1, new_output: true, looping: false, exited: false});
    expect(good).toMatchObject({action: 'nudge', message: 'go'});
    const bad = await superviseWith(['sh', '-c', 'echo nope; exit 1'], {}, {goal: 'g', tail: 't', elapsed_s: 1, quiet_s: 1, new_output: true, looping: false, exited: false});
    expect(bad.action).toBe('keep_waiting');
    const weird = await superviseWith(['sh', '-c', 'echo \'{"action":"rm -rf"}\''], {}, {goal: 'g', tail: 't', elapsed_s: 1, quiet_s: 1, new_output: true, looping: false, exited: false});
    expect(weird.action).toBe('keep_waiting');
  });
});
