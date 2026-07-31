#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Comment codemod. Removes only machine-verifiable comment noise from `//` line
 * comments and proves the result by comparing the before/after AST.
 *
 * Usage:
 *   node codemod.js --repo <repoRoot> --dirs <dir>[,<dir>] [--apply] [--report out.json]
 *
 * Without --apply it is a dry run: nothing is written.
 * Every rewritten file is AST-compared against the original; a mismatch aborts
 * the file (and, in --apply mode, is never written).
 */

const fs = require('fs');
const path = require('path');

const RULES = {R1: 'commented-out-code', R2: 'banner', R3: 'step-number', R4: 'restate'};

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'lib', 'build', 'dist', 'static', '.cache', 'coverage',
  '.next', 'out', 'vendor', '__snapshots__', 'avadaseo', 'editor', 'EditorJs'
]);
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);

/** Comments matching any of these are never removed, whatever else they look like. */
const PROTECT = [
  /^\s*(eslint|@ts-|ts-|prettier-ignore|istanbul|jshint|globals|c8\s|v8\s|webpack|vite|@vite|deno-lint|biome-ignore)/i,
  /\b(TODO|FIXME|HACK|XXX|NOTE|IMPORTANT|WHY|WARNING|WARN|DEPRECATED|BUG)\b/i,
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i,
  /\b(because|why|workaround|work around|bug|limit|quota|race|temporar|fallback|edge case|do not|don't|must|careful|caution|gotcha|known issue|intentional|on purpose|otherwise|beware)\b/i,
  /copyright|licen[cs]e|SPDX/i
];

/**
 * Extra protection for prose only.
 *
 * A URL or an `@tag` in a sentence means the sentence is worth keeping. Inside a
 * block that already parses as JavaScript they mean nothing of the sort — they
 * are an `xmlns` on commented-out SVG markup, or the `@param` of a commented-out
 * function's own JSDoc. Applying them there kept 1296 lines of dead code alive.
 */
const PROTECT_PROSE = [/https?:\/\//i, /@\w+/, /\bshopify\b/i];

/** A line the codemod is willing to call "code" rather than prose. */
const STRONG_CODE = /^\s*(const|let|var|return|if\s*\(|else\b|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(|throw\s|await\s|async\s|function\b|class\s|import\s|export\s|console\.|process\.|module\.exports|require\()|[;{}]\s*$|=>|=\s*[^=]|\w+\s*\([^)]*\)\s*;?\s*$/;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'and', 'or', 'if', 'is', 'are',
  'we', 'this', 'that', 'it', 'then', 'now', 'step', 'first', 'second', 'third',
  'here', 'new', 'from', 'with', 'by', 'into', 'all', 'each', 'its', 'be', 'as',
  'do', 'does', 'so', 'not', 'no', 'yes', 'at', 'up', 'out', 'via', 'per'
]);

function parserFor(file) {
  const parser = require(path.join(REPO_ROOT, 'node_modules', '@babel/parser'));
  const ts = file.endsWith('.ts') || file.endsWith('.tsx');
  return src =>
    parser.parse(src, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowSuperOutsideMethod: true,
      allowUndeclaredExports: true,
      errorRecovery: false,
      plugins: [
        ts ? 'typescript' : 'flow',
        'jsx',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'decorators-legacy',
        'exportDefaultFrom',
        'topLevelAwait',
        'importAssertions'
      ]
    });
}

let REPO_ROOT = process.cwd();

// `parenStart` and `trailingComma` hold source offsets, not meaning — they shift
// whenever a comment above them changes length.
const DROP_KEYS = new Set([
  'start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments',
  'innerComments', 'comments', 'tokens', 'parenStart', 'trailingComma', 'errors'
]);

/** Strip everything positional/comment-related so two ASTs compare on structure alone. */
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

function astEqual(parse, before, after) {
  const a = JSON.stringify(normalize(parse(before).program));
  const b = JSON.stringify(normalize(parse(after).program));
  return a === b;
}

function protectedComment(value) {
  return PROTECT.some(re => re.test(value));
}

function words(text) {
  return text
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.toLowerCase())
    .filter(w => !STOPWORDS.has(w));
}

/** Identifier tokens of a code line, camelCase split, lowercased. */
function codeTokens(line) {
  const raw = line.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const out = new Set();
  for (const t of raw) {
    out.add(t.toLowerCase());
    for (const part of t.split(/(?=[A-Z])/)) if (part) out.add(part.toLowerCase());
  }
  return out;
}

function isBanner(value) {
  return /^\s*[-=*_#~+]{4,}\s*$/.test(value);
}

/** Does this run of comment bodies look like commented-out code? */
function looksLikeCode(bodies, parse) {
  const lines = bodies.map(b => b.trim()).filter(Boolean);
  if (!lines.length) return false;
  const strong = lines.filter(l => STRONG_CODE.test(l)).length;
  if (strong === 0) return false;
  if (strong / lines.length < 0.5) return false;
  try {
    parse(bodies.join('\n'));
    return true;
  } catch (e) {
    return false;
  }
}

const RUN_GAP = 3;

function isOwnLine(c, lines) {
  return c.type === 'CommentLine' && /^\s*$/.test(lines[c.loc.start.line - 1].slice(0, c.loc.start.column));
}

/**
 * Collect own-line `//` comments grouped into runs.
 *
 * Blank lines do not end a run. A commented-out function often has blank lines
 * inside it; splitting on them lets one half parse on its own and get deleted
 * while the other half survives as a fragment referencing symbols that no
 * longer appear anywhere. Spanning the gap keeps such a block as one unit.
 */
function ownLineRuns(comments, lines) {
  const own = comments.filter(c => isOwnLine(c, lines));
  const runs = [];
  let cur = [];
  for (const c of own) {
    const prev = cur.length ? cur[cur.length - 1].loc.end.line : null;
    const gapBlank =
      prev !== null &&
      c.loc.start.line - prev <= RUN_GAP + 1 &&
      lines.slice(prev, c.loc.start.line - 1).every(l => !l.trim());
    if (prev !== null && (c.loc.start.line === prev + 1 || gapBlank)) cur.push(c);
    else {
      if (cur.length) runs.push(cur);
      cur = [c];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Names a run of commented-out code declares, imports included. */
function declaredNames(body) {
  const names = new Set();
  const decl = /\b(?:const|let|var|function|class|import)\s+(?:\{([^}]*)\}|\[([^\]]*)\]|([A-Za-z_$][\w$]*))/g;
  let m;
  while ((m = decl.exec(body))) {
    const group = m[1] || m[2];
    if (group) {
      for (const part of group.split(',')) {
        const name = part.split(':').pop().split('=')[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    } else if (m[3]) names.add(m[3]);
  }
  return names;
}

function identifiers(text) {
  return new Set(text.match(/[A-Za-z_$][\w$]*/g) || []);
}

function intersects(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/**
 * Decide which runs of commented-out code may be deleted.
 *
 * A commented-out block often spans several runs, and some of them never
 * qualify on their own — a bare object property, a dangling brace, a line the
 * protection list covers. Deleting the rest leaves fragments referring to
 * names that are then defined nowhere at all. So a run is anchored (kept) when
 * a comment that is staying mentions a name it declares, or when it mentions a
 * name declared by an anchored run. Anchoring propagates to a fixpoint, which
 * keeps a whole block together however it was split.
 */
function keepableRuns(lines, candidateRuns, allComments) {
  // Survivors include `{/* ... */}` JSX blocks, which routinely hold the disabled
  // markup that a deleted `//` definition exists to serve.
  const doomedLines = new Set();
  for (const run of candidateRuns) for (const c of run) doomedLines.add(c.loc.start.line);
  const survivors = allComments.filter(c => !doomedLines.has(c.loc.start.line));
  const info = candidateRuns.map(run => {
    const body = run.map(c => c.value).join('\n');
    return {
      run,
      declares: declaredNames(body),
      mentions: identifiers(body),
      from: run[0].loc.start.line - RUN_GAP - 1,
      to: run[run.length - 1].loc.end.line + RUN_GAP + 1
    };
  });

  const survivorDeclares = new Set();
  for (const c of survivors) for (const n of declaredNames(c.value)) survivorDeclares.add(n);

  const anchored = info.map(
    i =>
      survivors.some(c => intersects(i.declares, identifiers(c.value))) ||
      intersects(i.mentions, survivorDeclares) ||
      survivors.some(
        c =>
          isOwnLine(c, lines) &&
          c.loc.start.line >= i.from &&
          c.loc.start.line <= i.to &&
          STRONG_CODE.test(c.value.trim())
      )
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < info.length; i++) {
      if (anchored[i]) continue;
      for (let j = 0; j < info.length; j++) {
        if (i === j || !anchored[j]) continue;
        if (intersects(info[i].mentions, info[j].declares) || intersects(info[i].declares, info[j].mentions)) {
          anchored[i] = true;
          changed = true;
          break;
        }
      }
    }
  }

  return info.filter((_, i) => !anchored[i]).map(i => i.run);
}

function prevCodeLine(lines, lineNo) {
  for (let i = lineNo - 2; i >= 0; i--) if (lines[i].trim()) return lines[i].trim();
  return '';
}

function nextCodeLine(lines, lineNo) {
  for (let i = lineNo; i < lines.length; i++) if (lines[i].trim()) return lines[i].trim();
  return '';
}

/** Skip a run that is the entire body of a block — deleting it makes an empty block. */
function soleBlockBody(lines, run) {
  const before = prevCodeLine(lines, run[0].loc.start.line);
  const after = nextCodeLine(lines, run[run.length - 1].loc.start.line);
  return /\{\s*$/.test(before) && /^\}/.test(after);
}

function processFile(file, opts = {}) {
  const rules = opts.rules || new Set(['R1', 'R2', 'R3', 'R4']);
  const src = fs.readFileSync(file, 'utf8');
  const parse = parserFor(file);
  let ast;
  try {
    ast = parse(src);
  } catch (e) {
    return {file, skipped: 'parse-error', message: e.message};
  }
  const lines = src.split('\n');
  const runs = ownLineRuns(ast.comments || [], lines);
  let doomed = [];
  const codeRuns = [];

  for (const run of runs) {
    if (run.some(c => protectedComment(c.value))) continue;

    // R2 — banner separators are judged per comment, not per run.
    for (const c of run) if (isBanner(c.value)) doomed.push({c, rule: 'R2'});

    const rest = run.filter(c => !isBanner(c.value));
    if (!rest.length) continue;
    if (soleBlockBody(lines, rest)) continue;

    // R1 — the whole remaining run is commented-out code. A URL or an `@tag`
    // protects prose, not markup and JSDoc that came along with the dead code.
    const isCode = looksLikeCode(rest.map(c => c.value), parse);
    if (!isCode && rest.some(c => PROTECT_PROSE.some(re => re.test(c.value)))) continue;
    if (isCode) {
      codeRuns.push(rest);
      continue;
    }

    // R3/R4 — a lone short comment that only restates the line below it.
    if (rest.length !== 1) continue;
    const c = rest[0];
    let body = c.value.trim();
    if (body.length > 60) continue;
    const isStep = /^(step\s*\d+|[0-9]+)\s*[.):-]\s*/i.test(body);
    body = body.replace(/^(step\s*\d+|[0-9]+)\s*[.):-]\s*/i, '');
    const w = words(body);
    if (!w.length || w.length > 6) continue;
    const next = nextCodeLine(lines, c.loc.end.line);
    if (!next) continue;
    const toks = codeTokens(next);
    if (w.every(x => toks.has(x))) doomed.push({c, rule: isStep ? 'R3' : 'R4'});
  }

  // A commented-out run is deleted only when no code-shaped `//` comment
  // survives beside it; otherwise the block would be left half-eaten.
  for (const run of keepableRuns(lines, codeRuns, ast.comments || [])) {
    for (const c of run) doomed.push({c, rule: 'R1'});
  }

  // R3/R4 are judgement calls, so they only run against an approved line list.
  const rel = path.relative(REPO_ROOT, file);
  const approved = opts.approved;
  if (approved) {
    doomed = doomed.filter(d => d.rule === 'R1' || d.rule === 'R2' || approved.has(`${rel}:${d.c.loc.start.line}`));
  }

  // Rules the caller did not enable become candidates for a human to adjudicate.
  const candidates = doomed
    .filter(d => !rules.has(d.rule))
    .map(d => ({
      file,
      line: d.c.loc.start.line,
      rule: d.rule,
      comment: `//${d.c.value}`,
      context: lines
        .slice(Math.max(0, d.c.loc.start.line - 4), d.c.loc.start.line + 4)
        .map((t, i) => `${Math.max(1, d.c.loc.start.line - 3) + i}: ${t}`)
        .join('\n')
    }));
  doomed = doomed.filter(d => rules.has(d.rule));

  if (!doomed.length) return {file, removed: 0, byRule: {}, changed: false, candidates};

  // Remove whole lines, back to front so earlier offsets stay valid.
  const dropLines = new Set();
  const byRule = {};
  for (const d of doomed) {
    for (let l = d.c.loc.start.line; l <= d.c.loc.end.line; l++) dropLines.add(l);
    byRule[d.rule] = (byRule[d.rule] || 0) + 1;
  }
  // A commented-out block can hold blank lines. Once its comments go those
  // blanks stack up as an empty gap, so drop any blank the deletion encloses.
  for (let pass = 0; pass < lines.length; pass++) {
    let grew = false;
    for (let l = 2; l < lines.length; l++) {
      if (dropLines.has(l) || lines[l - 1].trim()) continue;
      if (dropLines.has(l - 1) && dropLines.has(l + 1)) {
        dropLines.add(l);
        grew = true;
      }
    }
    if (!grew) break;
  }

  // A block flanked by a blank line on each side leaves both behind. Keep one.
  for (const l of [...dropLines].sort((a, b) => a - b)) {
    if (dropLines.has(l - 1)) continue;
    let end = l;
    while (dropLines.has(end + 1)) end++;
    const above = l - 1;
    const below = end + 1;
    if (above >= 1 && below <= lines.length && !lines[above - 1].trim() && !lines[below - 1].trim()) {
      dropLines.add(above);
    }
  }

  const out = lines.filter((_, i) => !dropLines.has(i + 1)).join('\n');

  if (!astEqual(parse, src, out)) {
    return {file, skipped: 'ast-mismatch', removed: 0, byRule: {}, candidates};
  }

  return {
    file,
    removed: dropLines.size,
    byRule,
    changed: true,
    out,
    candidates,
    samples: doomed.slice(0, 3).map(d => `${d.rule}: //${d.c.value}`)
  };
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (EXTS.has(path.extname(entry.name)) && !entry.name.endsWith('.min.js')) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = name => {
    const i = argv.indexOf(name);
    return i === -1 ? null : argv[i + 1];
  };
  REPO_ROOT = path.resolve(arg('--repo') || process.cwd());
  const dirs = (arg('--dirs') || '').split(',').filter(Boolean).map(d => path.resolve(REPO_ROOT, d));
  const apply = argv.includes('--apply');
  const reportPath = arg('--report');
  const candidatesPath = arg('--candidates');
  const rules = new Set((arg('--rules') || 'R1,R2,R3,R4').split(',').filter(Boolean));
  const approvedPath = arg('--approved');
  const approved = approvedPath
    ? new Set(JSON.parse(fs.readFileSync(approvedPath, 'utf8')).map(a => `${a.file}:${a.line}`))
    : null;
  if (approved) for (const r of ['R3', 'R4']) rules.add(r);

  const files = dirs.flatMap(d => (fs.existsSync(d) ? walk(d, []) : []));
  const results = [];
  const allCandidates = [];
  const totals = {files: files.length, changedFiles: 0, removed: 0, byRule: {}, astMismatch: 0, parseError: 0, candidates: 0};

  for (const f of files) {
    const r = processFile(f, {rules, approved});
    for (const c of r.candidates || []) allCandidates.push({...c, file: path.relative(REPO_ROOT, c.file)});
    if (r.skipped === 'ast-mismatch') totals.astMismatch++;
    if (r.skipped === 'parse-error') totals.parseError++;
    if (!r.changed) continue;
    totals.changedFiles++;
    totals.removed += r.removed;
    for (const [k, v] of Object.entries(r.byRule)) totals.byRule[k] = (totals.byRule[k] || 0) + v;
    if (apply) fs.writeFileSync(f, r.out, 'utf8');
    results.push({file: path.relative(REPO_ROOT, f), removed: r.removed, byRule: r.byRule, samples: r.samples});
  }

  totals.candidates = allCandidates.length;
  results.sort((a, b) => b.removed - a.removed);
  console.log(JSON.stringify({mode: apply ? 'apply' : 'dry-run', repo: REPO_ROOT, rules: [...rules], totals}, null, 2));
  console.log('\ntop files:');
  for (const r of results.slice(0, 20)) {
    console.log(`  ${String(r.removed).padStart(4)}  ${JSON.stringify(r.byRule)}  ${r.file}`);
  }
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify({totals, results}, null, 2));
  if (candidatesPath) fs.writeFileSync(candidatesPath, JSON.stringify(allCandidates, null, 2));
}

if (require.main === module) main();
module.exports = {
  processFile,
  looksLikeCode,
  isBanner,
  words,
  codeTokens,
  protectedComment,
  setRepoRoot: root => {
    REPO_ROOT = root;
  }
};
