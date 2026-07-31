#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Prove that a working-tree change touched comments and nothing else.
 *
 *   node verify-comments-only.js --repo <repoRoot> [--base HEAD] [--revert]
 *
 * For every changed file it parses the base version and the working version,
 * strips comments and every positional field, and deep-compares the ASTs. A
 * file whose code changed is reported as MISMATCH; with --revert it is restored
 * from the base so a bad edit cannot survive the run. Exits non-zero if any
 * file mismatched or failed to parse.
 */

const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = name => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const REPO = path.resolve(arg('--repo') || process.cwd());
const BASE = arg('--base') || 'HEAD';
const REVERT = argv.includes('--revert');

const parser = require(path.join(REPO, 'node_modules', '@babel/parser'));
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);

// `parenStart` and `trailingComma` hold source offsets, not meaning — they shift
// whenever a comment above them changes length.
const DROP_KEYS = new Set([
  'start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments',
  'innerComments', 'comments', 'tokens', 'parenStart', 'trailingComma', 'errors'
]);

function normalize(node) {
  if (Array.isArray(node)) return node.map(normalize);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const k of Object.keys(node).sort()) {
    if (DROP_KEYS.has(k)) continue;
    out[k] = normalize(node[k]);
  }
  return out;
}

function parse(src, file) {
  const ts = /\.tsx?$/.test(file);
  return parser.parse(src, {
    sourceType: 'unambiguous',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowSuperOutsideMethod: true,
    allowUndeclaredExports: true,
    plugins: [
      ts ? 'typescript' : 'flow', 'jsx', 'classProperties', 'classPrivateProperties',
      'classPrivateMethods', 'objectRestSpread', 'optionalChaining',
      'nullishCoalescingOperator', 'dynamicImport', 'decorators-legacy',
      'exportDefaultFrom', 'topLevelAwait', 'importAssertions'
    ]
  });
}

const git = args => execFileSync('git', ['-C', REPO, ...args], {encoding: 'utf8', maxBuffer: 1 << 28});

const changed = git(['diff', '--name-only', BASE])
  .split('\n')
  .filter(f => f && EXTS.has(path.extname(f)));

let ok = 0;
const bad = [];

for (const rel of changed) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) {
    bad.push([rel, 'deleted']);
    continue;
  }
  let before;
  try {
    before = git(['show', `${BASE}:${rel}`]);
  } catch {
    bad.push([rel, 'no base version']);
    continue;
  }
  const after = fs.readFileSync(abs, 'utf8');
  try {
    const a = JSON.stringify(normalize(parse(before, rel).program));
    const b = JSON.stringify(normalize(parse(after, rel).program));
    if (a === b) {
      ok++;
      continue;
    }
    bad.push([rel, 'MISMATCH — code changed, not just comments']);
  } catch (e) {
    bad.push([rel, `parse error: ${e.message.split('\n')[0]}`]);
  }
  if (REVERT) {
    fs.writeFileSync(abs, before, 'utf8');
  }
}

console.log(`${changed.length} changed source files: ${ok} comment-only, ${bad.length} rejected`);
for (const [rel, why] of bad) console.log(`  REJECT ${rel}: ${why}${REVERT ? ' (reverted)' : ''}`);
process.exit(bad.length ? 1 : 0);
