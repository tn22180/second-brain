import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';

export function sh(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(args, {cwd});
  if (r.exitCode !== 0) throw new Error(`${args.join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

export function write(root: string, rel: string, body: string) {
  mkdirSync(dirname(join(root, rel)), {recursive: true});
  writeFileSync(join(root, rel), body);
}

/** A committed repo with src/a.js and src/b.js. */
export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  sh(dir, 'git', 'init', '-q', '-b', 'master');
  sh(dir, 'git', 'config', 'user.email', 't@t');
  sh(dir, 'git', 'config', 'user.name', 't');
  write(dir, 'src/a.js', 'module.exports = 1;\n');
  write(dir, 'src/b.js', 'module.exports = 2;\n');
  sh(dir, 'git', 'add', '-A');
  sh(dir, 'git', 'commit', '-qm', 'init');
  return dir;
}
