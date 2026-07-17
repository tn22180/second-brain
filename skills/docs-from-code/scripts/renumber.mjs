#!/usr/bin/env node
/**
 * Re-resolve `path:line` citations after the docs' tree moves under them — a rebase onto a moved
 * target, a stale branch catching up, a long-lived branch merging.
 *
 * The doc's INTENT is the line CONTENT it pointed at in the old tree. So: read that content from
 * --old-rev, find it in the new tree, rewrite the number. A citation is rewritten only on evidence
 * — a unique content match, or a unique match once surrounding lines disambiguate. Anything else is
 * reported for a human. "Take the nearest of 7 candidates" is a guess, and a guessed citation is
 * worse than a dead one: the gate goes green and the doc is still wrong.
 *
 * NOT IDEMPOTENT. It reads old-tree content at the citation's CURRENT number, so a second --apply
 * run reads the wrong lines and produces garbage. Run once per move. Verify with the gate, never by
 * re-running this.
 *
 * Usage:
 *   node renumber.mjs --repo /path/to/repo --old-rev <sha-or-branch>            # dry run
 *   node renumber.mjs --repo /path/to/repo --old-rev <sha-or-branch> --apply
 *
 *   --old-rev       the tree the docs were written/verified against (REQUIRED)
 *   --repo          target repo root (default: cwd)
 *   --apply         write the changes (default: dry run)
 *   --docs          comma-separated dirs to scan, e.g. "docs/features/,.claude/skills/"
 *                   Only needed when the repo has no scripts/docs-gate/ to borrow isLiving() from.
 *   --anchor-roots  comma-separated (default: packages/,extensions/)
 */

import {execFileSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';

const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : argv[i + 1];
};
const REPO = path.resolve(flag('repo', process.cwd()));
const OLD_REV = flag('old-rev');
const APPLY = argv.includes('--apply');

if (!OLD_REV) {
  console.error('--old-rev is required: the tree the docs were written against.');
  process.exit(2);
}
process.chdir(REPO);

const git = a => execFileSync('git', a, {cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28});
try {
  git(['rev-parse', OLD_REV]);
} catch {
  console.error(`--old-rev ${OLD_REV} does not resolve in ${REPO}`);
  process.exit(2);
}

// Borrow the repo's own parser when docs-gate is installed, so there is exactly one definition of
// "what a citation is". Only fall back when it isn't — a second copy of the regex is a second thing
// to drift.
const require_ = createRequire(import.meta.url);
const gatePath = path.join(REPO, 'scripts/docs-gate/citations.js');
const ANCHOR_ROOTS = flag('anchor-roots', 'packages/,extensions/').split(',').filter(Boolean);
let parseCitations, isAnchored, isLiving;

if (fs.existsSync(gatePath)) {
  ({parseCitations, isAnchored} = require_(gatePath));
  ({isLiving} = require_(path.join(REPO, 'scripts/docs-gate/gitContext.js')));
  console.error('using the repo\'s own scripts/docs-gate parser (docs-gate is installed)');
} else {
  const FILE_TOKEN = String.raw`[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:js|jsx|mjs|ts|tsx|json|yml|yaml|sh|md|toml|rules|liquid)`;
  const CITE = new RegExp(FILE_TOKEN + String.raw`:(\d+)(?:-(\d+))?`, 'g');
  const SKIP = /<!--\s*citation-skip:/;
  parseCitations = text =>
    text.split('\n').flatMap((line, i) => {
      if (SKIP.test(line)) return [];
      CITE.lastIndex = 0;
      const out = [];
      let m;
      while ((m = CITE.exec(line)) !== null) {
        out.push({
          path: m[0].replace(/:\d+(?:-\d+)?$/, ''),
          startLine: parseInt(m[1], 10),
          endLine: m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10),
          docLine: i + 1,
          skipped: false
        });
      }
      return out;
    });
  isAnchored = p => ANCHOR_ROOTS.some(r => p.indexOf(r) === 0);
  const dirs = (flag('docs') || '').split(',').filter(Boolean);
  if (!dirs.length) {
    console.error('this repo has no scripts/docs-gate/, so --docs is required, e.g.');
    console.error('  --docs "docs/features/,docs/runbooks/,.claude/skills/,.claude/agents/"');
    process.exit(2);
  }
  isLiving = f => dirs.some(d => f.indexOf(d) === 0) && f.endsWith('.md');
  console.error(`no docs-gate found; scanning ${dirs.join(', ')} with the built-in parser`);
}

// This tool is not idempotent: a second --apply reads old-tree content at the ALREADY-REWRITTEN
// line numbers and produces confident nonsense (measured: 30 bogus rewrites, silently). It cannot
// detect that reliably — identical lines are common — so instead it guarantees the damage is always
// undoable: --apply refuses unless the docs are committed, leaving `git checkout --` as the exit.
if (APPLY && !argv.includes('--force')) {
  const dirty = execFileSync('git', ['status', '--porcelain'], {cwd: REPO, encoding: 'utf8'})
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('??'));
  if (dirty.length) {
    console.error('refusing --apply: the working tree has uncommitted changes.\n');
    dirty.slice(0, 10).forEach(l => console.error('  ' + l));
    if (dirty.length > 10) console.error(`  … ${dirty.length - 10} more`);
    console.error('\nCommit or stash first. This tool rewrites docs in place and must never be run');
    console.error('twice against the same --old-rev; a clean tree is what makes that recoverable');
    console.error('(git checkout -- <docs>). Use --force only if you have your own way back.');
    process.exit(2);
  }
}

const cacheOf = fn => {
  const m = new Map();
  return k => {
    if (!m.has(k)) m.set(k, fn(k));
    return m.get(k);
  };
};
const oldLines = cacheOf(p => {
  try {
    return git(['show', `${OLD_REV}:${p}`]).split('\n');
  } catch {
    return null;
  }
});
const newLines = cacheOf(p => {
  try {
    return fs.readFileSync(path.join(REPO, p), 'utf8').split('\n');
  } catch {
    return null;
  }
});

// Evidence, never proximity. Widen the fingerprint to neighbouring lines until exactly one
// candidate survives; if none does, that is a finding for a human, not a coin flip.
function locate(lines, content, oldAll, oldIdx) {
  if (content === null || content === undefined || content.trim() === '') {
    return {line: null, why: 'blank source line — the citation was already imprecise'};
  }
  const want = content.trim();
  const hits = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].trim() === want) hits.push(i + 1);
  if (hits.length === 0) return {line: null, why: 'content gone'};
  if (hits.length === 1) return {line: hits[0], why: 'unique'};
  const ctxOf = (arr, i, r) => arr.slice(Math.max(0, i - r), i + r + 1).map(l => l.trim()).join('\n');
  for (let r = 1; r <= 4; r++) {
    const fingerprint = ctxOf(oldAll, oldIdx, r);
    const kept = hits.filter(h => ctxOf(lines, h - 1, r) === fingerprint);
    if (kept.length === 1) return {line: kept[0], why: `unique with ±${r} lines of context`};
    if (kept.length === 0) break;
  }
  return {line: null, why: `ambiguous (${hits.length} identical lines, context did not separate them)`};
}

const tracked = git(['ls-files']).split('\n').filter(Boolean);
const living = tracked.filter(isLiving);
const edits = [];
const manual = [];
let unchanged = 0;

living.forEach(doc => {
  parseCitations(fs.readFileSync(path.join(REPO, doc), 'utf8')).forEach(c => {
    if (!isAnchored(c.path) || c.skipped) return;
    const nl = newLines(c.path);
    if (!nl) {
      manual.push(`${doc}:${c.docLine}  ${c.path}:${c.startLine}  -> FILE GONE from the new tree`);
      return;
    }
    const ol = oldLines(c.path);
    if (!ol) {
      manual.push(`${doc}:${c.docLine}  ${c.path}  -> not present in ${OLD_REV}`);
      return;
    }
    const hasEnd = c.endLine && c.endLine !== c.startLine;
    const sOld = ol[c.startLine - 1];
    const eOld = hasEnd ? ol[c.endLine - 1] : null;

    const same = (a, b) => a !== undefined && b !== undefined && a.trim() === b.trim();
    if (same(nl[c.startLine - 1], sOld) && (!hasEnd || same(nl[c.endLine - 1], eOld))) {
      unchanged++;
      return;
    }

    const s = locate(nl, sOld, ol, c.startLine - 1);
    const e = hasEnd ? locate(nl, eOld, ol, c.endLine - 1) : {line: null, why: 'n/a'};
    const range = hasEnd ? `-${c.endLine}` : '';
    if (s.line === null || (hasEnd && e.line === null)) {
      manual.push(
        `${doc}:${c.docLine}  ${c.path}:${c.startLine}${range}  -> ${s.why}${hasEnd ? ' / ' + e.why : ''}`
      );
      return;
    }
    if (hasEnd && e.line < s.line) {
      manual.push(`${doc}:${c.docLine}  ${c.path}:${c.startLine}${range}  -> end lands before start; the range broke apart`);
      return;
    }
    const from = `${c.path}:${c.startLine}${range}`;
    const to = `${c.path}:${s.line}${hasEnd ? '-' + e.line : ''}`;
    if (from === to) unchanged++;
    else edits.push({doc, docLine: c.docLine, from, to, why: s.why});
  });
});

// A plain string replace of `a.js:87` also corrupts `a.js:870` and the `87` inside `a.js:87-92`.
// Anchor every rewrite: never followed by a digit, and a bare `:N` never followed by `-`.
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (APPLY) {
  const byDoc = new Map();
  edits.forEach(e => byDoc.set(e.doc, (byDoc.get(e.doc) || []).concat(e)));
  byDoc.forEach((list, doc) => {
    const abs = path.join(REPO, doc);
    let t = fs.readFileSync(abs, 'utf8');
    const seen = new Set();
    list
      .sort((a, b) => b.from.length - a.from.length)
      .forEach(e => {
        if (seen.has(e.from)) return;
        seen.add(e.from);
        const tail = e.from.includes('-') ? '(?!\\d)' : '(?![-\\d])';
        const before = t;
        t = t.replace(new RegExp(esc(e.from) + tail, 'g'), e.to);
        if (t === before) console.error(`  WARN no-op rewrite: ${doc}  ${e.from}`);
      });
    fs.writeFileSync(abs, t);
  });
}

console.log(`repo:    ${REPO}`);
console.log(`old rev: ${OLD_REV}  (${git(['rev-parse', '--short', OLD_REV]).trim()})`);
console.log(`living docs scanned:  ${living.length}`);
console.log(`already correct:      ${unchanged}`);
console.log(`renumbered${APPLY ? ' (APPLIED)' : ' (dry run)'}: ${edits.length}`);
console.log(`needs a human:        ${manual.length}`);
if (edits.length) {
  console.log('\n--- renumbered ---');
  edits.forEach(e => console.log(`  ${e.doc}:${e.docLine}  ${e.from}  ->  ${e.to}   [${e.why}]`));
}
if (manual.length) {
  console.log('\n--- needs a human (NOT rewritten) ---');
  manual.forEach(m => console.log(`  ${m}`));
  console.log('\n  Each needs someone to read what the doc CLAIMS and check it against the new tree.');
  console.log('  Often the claim itself is false, not merely mis-numbered — re-pointing it at a');
  console.log('  nearby line would launder a wrong statement into a passing one.');
}
if (APPLY) {
  console.log('\nDo NOT re-run --apply. Verify with the gate, or by reading the diff.');
}
