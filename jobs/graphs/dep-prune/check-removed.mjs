#!/usr/bin/env node
// Verify gate for dep-prune graphs, run from the worktree root: `node check-removed.mjs <baseRef>`.
// A dep counts as removed only when NO manifest in the repo declares it any more — yarn hoists, so a
// name still declared by a sibling workspace keeps resolving and is not this check's concern.
import {execFileSync} from 'node:child_process';

const base = process.argv[2] || 'origin/master';
const git = (...a) => execFileSync('git', a, {encoding: 'utf8', maxBuffer: 1 << 28});

const manifests = ref => {
  const files = ref
    ? git('ls-tree', '-r', '--name-only', ref).split('\n')
    : git('ls-files', '--cached', '--others', '--exclude-standard').split('\n');
  const names = new Set();
  for (const f of files) {
    if (!/(^|\/)package\.json$/.test(f) || f.includes('node_modules/')) continue;
    let j;
    try {
      j = JSON.parse(ref ? git('show', `${ref}:${f}`) : execFileSync('cat', [f], {encoding: 'utf8'}));
    } catch {
      continue;
    }
    for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const n of Object.keys(j[k] || {})) names.add(n);
    }
  }
  return names;
};

const before = manifests(base);
const after = manifests(null);
const removed = [...before].filter(n => !after.has(n));
console.log(`removed (${removed.length}): ${removed.join(' ') || '-'}`);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bad = [];
for (const n of removed) {
  // Quoted module specifier, optionally with a subpath: 'pkg', "pkg/x", `pkg`, '~pkg'.
  const re = `['"\`~]${esc(n)}(['"\`/])`;
  let out = '';
  try {
    // glob magic: plain `:!**/x` needs a slash, so it would not exclude the root yarn.lock.
    const ex = ['yarn.lock', 'package-lock.json', '*.json', '*.md', 'CHANGELOG*'].map(p => `:(exclude,glob)**/${p}`);
    out = git('grep', '-nE', re, '--', '.', ...ex);
  } catch {
    continue;
  }
  if (out.trim()) bad.push(`${n}:\n${out.trim().split('\n').slice(0, 5).map(l => '  ' + l).join('\n')}`);
}
if (bad.length) {
  console.error(`still referenced after removal:\n${bad.join('\n')}`);
  process.exit(1);
}
