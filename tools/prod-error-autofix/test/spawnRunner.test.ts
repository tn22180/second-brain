import {describe, expect, test} from 'bun:test';
import {spawnRunner} from '../src/gcloud/run';

/**
 * These spawn real processes on purpose.
 *
 * The bug they cover was invisible to every stubbed test in this suite: job `te44sp`
 * hung for 11.8 hours on 2026-07-30 because `proc.kill()` signalled only the direct
 * child while a grandchild kept the stdout pipe open, so the read never ended and the
 * timeout — which had already fired — could not make the call return. With a
 * concurrency cap in front of it, that one stuck promise froze the whole queue: 59
 * later alerts came back `deferred`.
 */
describe('spawnRunner', () => {
  test('a normal command returns its output and exit code', async () => {
    const res = await spawnRunner(['bash', '-c', 'echo out; echo err >&2; exit 3'], 10_000);
    expect(res.code).toBe(3);
    expect(res.stdout.trim()).toBe('out');
    expect(res.stderr.trim()).toBe('err');
    expect(res.timedOut).toBe(false);
  });

  test('a child that outlives its timeout is killed and reported, not awaited', async () => {
    const started = Date.now();
    const res = await spawnRunner(['bash', '-c', 'sleep 30'], 300);
    expect(res.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  /** The exact shape of the live hang: the parent dies, a grandchild holds the pipe. */
  test('a grandchild holding the output pipe cannot hang the call', async () => {
    const started = Date.now();
    // `sleep 30 &` inherits stdout and keeps it open after the parent shell exits.
    const res = await spawnRunner(['bash', '-c', 'sleep 30 & sleep 30'], 300);
    expect(res.timedOut).toBe(true);
    // Would be ~30s if the pipe were waited on; the drain grace is 2s.
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 15_000);

  test('the whole process group is killed, not just the direct child', async () => {
    const marker = `autofix-spawn-test-${process.pid}`;
    await spawnRunner(['bash', '-c', `sleep 30 --${marker} & sleep 30 --${marker}`], 300);
    // Give the signal a moment to land before looking.
    await Bun.sleep(500);
    const survivors = await spawnRunner(['pgrep', '-f', marker], 5_000);
    expect(survivors.stdout.trim()).toBe('');
  }, 15_000);
});
