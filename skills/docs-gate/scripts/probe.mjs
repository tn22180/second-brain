#!/usr/bin/env node
/**
 * Measure a target repo before stamping a docs gate into it.
 *
 * Prints a proposed token map, the citation corpus stats, the baseline debt, and the red flags
 * that decide whether the gate can be blocking on day one.
 *
 * Every number here is measured from the target repo. Nothing is inherited from the repo the
 * gate was first built in — that assumption is the whole reason this script exists.
 *
 * Usage: node ~/.claude/skills/docs-gate/scripts/probe.mjs --repo /path/to/repo
 */

import {execFileSync} from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const repoIdx = args.indexOf('--repo');
const REPO = path.resolve(repoIdx === -1 ? process.cwd() : args[repoIdx + 1]);

const git = a => execFileSync('git', a, {cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
const tracked = () => git(['ls-files']).split('\n').filter(Boolean);
const read = f => {
  try {
    return fs.readFileSync(path.join(REPO, f), 'utf8');
  } catch {
    return null;
  }
};
const out = [];
const say = s => out.push(s);
const flags = [];

// --- 0. sanity ---------------------------------------------------------------
try {
  git(['rev-parse', '--git-dir']);
} catch {
  console.error(`not a git repo: ${REPO}`);
  process.exit(2);
}
const FILES = tracked();

// --- 1. default branch -------------------------------------------------------
let defaultBranch = 'master';
try {
  const head = git(['symbolic-ref', 'refs/remotes/origin/HEAD']).trim();
  defaultBranch = head.split('/').pop();
} catch {
  defaultBranch = FILES.length && git(['branch', '-a']).includes('remotes/origin/main') ? 'main' : 'master';
}

// --- 2. anchor roots: top-level dirs that actually hold source ---------------
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|vue|py|go|rb|php)$/;
const topDirCount = {};
FILES.filter(f => CODE_EXT.test(f) && !f.includes('node_modules/')).forEach(f => {
  const top = f.split('/')[0];
  if (!f.includes('/')) return;
  topDirCount[top] = (topDirCount[top] || 0) + 1;
});
// An anchor root is only safe if its name never appears as a NESTED path segment. If it does,
// a document-relative citation ("scripts/x.js:5" written inside a doc about packages/functions,
// where the file really lives at packages/functions/scripts/x.js) parses as root-anchored, and
// the gate reports rot against a file that exists. Measured: this exact case fired on `scripts/`.
const nestedSegments = new Set();
FILES.forEach(f => f.split('/').slice(1, -1).forEach(seg => nestedSegments.add(seg)));
const anchorCandidates = Object.entries(topDirCount)
  .filter(([d, n]) => n >= 5 && !d.startsWith('.'))
  .sort((a, b) => b[1] - a[1]);
const anchorRoots = anchorCandidates.filter(([d]) => !nestedSegments.has(d)).map(([d]) => `${d}/`);
const anchorRejected = anchorCandidates.filter(([d]) => nestedSegments.has(d)).map(([d]) => d);
if (anchorRejected.length) {
  flags.push(
    `rejected as anchor roots (name also occurs nested, so document-relative citations would ` +
      `masquerade as anchored): ${anchorRejected.join(', ')}. Citations under these stay unchecked — ` +
      'that is correct, not a gap to close.'
  );
}

// --- 3. monorepo shape -------------------------------------------------------
const isMonorepo = FILES.some(f => /^packages\/[^/]+\//.test(f));
const packages = [...new Set(FILES.filter(f => /^packages\/[^/]+\//.test(f)).map(f => f.split('/')[1]))];

// --- 4. living docs present --------------------------------------------------
const CANDIDATE_DIRS = ['docs/features/', 'docs/runbooks/', '.claude/skills/', '.agent/skills/', 'docs/adr/'];
// `.agent/` is a byte-mirror of `.claude/`, not a second source. Counting both double-counts every
// citation and reports each finding twice against what is literally the same text. mirrorParity.js
// covers the mirror transitively — so the mirror is excluded here whenever its source is present.
const mirrored = FILES.some(f => f.startsWith('.claude/skills/')) && FILES.some(f => f.startsWith('.agent/skills/'));
const livingDirs = CANDIDATE_DIRS.filter(d => FILES.some(f => f.startsWith(d) && f.endsWith('.md')))
  .filter(d => !(mirrored && d.startsWith('.agent/')));
const CANDIDATE_FILES = ['CLAUDE.md', 'AGENTS.md', 'PATTERNS.md', '.cursorrules', 'CONTRIBUTING.md'];
const livingFiles = CANDIDATE_FILES.filter(f => FILES.includes(f));
const livingDocs = FILES.filter(
  f => (livingDirs.some(d => f.startsWith(d)) && f.endsWith('.md')) ||
    livingFiles.includes(f) ||
    /^packages\/[^/]+\/CLAUDE\.md$/.test(f)
);

// --- 5. mirror pairs ---------------------------------------------------------
const hasClaude = FILES.some(f => f.startsWith('.claude/'));
const hasAgent = FILES.some(f => f.startsWith('.agent/'));
const mirrorCandidates = [
  ['.claude/skills/', '.agent/skills/'],
  ['.claude/agents/', '.agent/agents/'],
  ['.claude/commands/', '.agent/workflows/'],
  ['.claude/workflows/', '.agent/rules/']
].filter(([c, a]) => FILES.some(f => f.startsWith(c)) && FILES.some(f => f.startsWith(a)));

// --- 6. test runner + module system -----------------------------------------
const pkg = JSON.parse(read('package.json') || '{}');
const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
const jestVer = allDeps.jest || null;
const jestMajor = jestVer ? parseInt(String(jestVer).replace(/[^0-9]/, '') || '0', 10) : 0;
const pkgType = pkg.type || 'commonjs';
const jestCfg = pkg.jest || (read('jest.config.js') ? 'jest.config.js' : null);
const moduleSystem = pkgType === 'module' ? 'esm' : 'commonjs';

if (jestVer && jestMajor < 27 && moduleSystem === 'commonjs') {
  flags.push(
    `jest ${jestVer} + no "type":"module" -> templates must stay CommonJS. .mjs is untestable here.`
  );
}
if (!jestVer) flags.push('no jest in package.json — port the tests to whatever runner this repo uses, or the gate ships untested.');

// --- 7. CI system ------------------------------------------------------------
const ci = FILES.includes('.gitlab-ci.yml')
  ? 'gitlab'
  : FILES.some(f => f.startsWith('.github/workflows/'))
    ? 'github'
    : 'none';
if (ci === 'none') flags.push('no CI config found — a gate nothing runs is theater. Find where CI lives first.');
if (ci === 'gitlab') {
  const ciTxt = read('.gitlab-ci.yml') || '';
  if (!ciTxt.includes('merge_request_event')) {
    flags.push(
      'no job in .gitlab-ci.yml uses merge_request_event — MR pipelines may be DISABLED in project ' +
        'settings. Confirm in the UI before claiming the gate blocks anything.'
    );
  }
}

// --- 8. lint reality ---------------------------------------------------------
let lintVerdict = 'no lint script';
if (pkg.scripts && (pkg.scripts.lint || pkg.scripts['eslint-fix'])) {
  const cmd = pkg.scripts.lint || pkg.scripts['eslint-fix'];
  const scoped = /--prefix|packages\//.test(cmd);
  lintVerdict = scoped
    ? `"${cmd}" — SCOPED to sub-packages; it will NOT lint scripts/. Match .prettierrc by hand.`
    : `"${cmd}" — verify it actually runs before promising it in a plan.`;
}

// --- 9. citation corpus ------------------------------------------------------
const FILE_TOKEN = String.raw`[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:js|jsx|mjs|ts|tsx|json|yml|yaml|sh|md|toml|rules|liquid)`;
const CITE_RE = new RegExp(FILE_TOKEN + String.raw`:(\d+)(?:-(\d+))?`, 'g');
const cites = [];
livingDocs.forEach(doc => {
  const txt = read(doc);
  if (txt === null) return;
  txt.split('\n').forEach((line, i) => {
    CITE_RE.lastIndex = 0;
    let m;
    while ((m = CITE_RE.exec(line)) !== null) {
      const raw = m[0];
      cites.push({doc, docLine: i + 1, raw, file: raw.replace(/:\d+(?:-\d+)?$/, ''), line: parseInt(m[1], 10)});
    }
  });
});
const anchored = cites.filter(c => anchorRoots.some(r => c.file.startsWith(r)));
const pct = cites.length ? Math.round((anchored.length / cites.length) * 100) : 0;

// --- 10. baseline debt: dead citations that exist RIGHT NOW ------------------
const trackedSet = new Set(FILES);
const lineCache = new Map();
const lineCountOf = f => {
  if (lineCache.has(f)) return lineCache.get(f);
  const txt = read(f);
  // count like `wc -l`: a trailing newline does not start a new line.
  const n = txt === null ? null : (txt.endsWith('\n') ? txt.slice(0, -1) : txt).split('\n').length;
  lineCache.set(f, n);
  return n;
};
const debt = [];
anchored.forEach(c => {
  if (!trackedSet.has(c.file)) {
    debt.push(`${c.doc}:${c.docLine}  ${c.raw}  -> file not tracked in git`);
    return;
  }
  const n = lineCountOf(c.file);
  if (n !== null && c.line > n) debt.push(`${c.doc}:${c.docLine}  ${c.raw}  -> past EOF (file has ${n} lines)`);
});

// --- 11. branch-prefix evidence ---------------------------------------------
let branchEvidence = 'could not measure (no merge history)';
try {
  const merges = git(['log', '--merges', '-99', '--pretty=%s']).split('\n').filter(Boolean);
  const withPrefix = merges.filter(s => /(feat|feature|fix|chore|hotfix)\//.test(s)).length;
  const commits = git(['log', '-200', '--pretty=%s']).split('\n').filter(Boolean);
  const conventional = commits.filter(s => /^feat(\(|:)/.test(s)).length;
  branchEvidence =
    `${withPrefix} of the last ${merges.length} merges carry a branch prefix; ` +
    `${conventional} of the last ${commits.length} commits say "feat:".`;
  if (merges.length && withPrefix / merges.length < 0.6) {
    flags.push(
      `only ${withPrefix}/${merges.length} merges carry a branch prefix — branch-prefix gating is a ` +
        'bad fit here. Re-decide the trigger before stamping featureDoc.js.'
    );
  }
} catch { /* shallow clone or no merges */ }

// --- 12. skill frontmatter ---------------------------------------------------
const skillFiles = FILES.filter(f => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f));
const skillsMissing = skillFiles.filter(f => {
  const txt = read(f) || '';
  return !/^trigger:/m.test(txt) || !/^why-not-claude-md:/m.test(txt);
});

// --- report ------------------------------------------------------------------
say(`# docs-gate probe — ${REPO}`);
say('');
say('## Proposed token map  (REVIEW EVERY LINE — these are guesses from file counts)');
say('```');
say(`{{ANCHOR_ROOTS}}      ${JSON.stringify(anchorRoots)}`);
say(`{{ANCHOR_ROOTS_PROSE}} ${anchorRoots.join(', ') || '(none detected)'}`);
say(`{{LIVING_DIRS}}       ${JSON.stringify(livingDirs)}`);
say(`{{LIVING_FILES}}      ${JSON.stringify(livingFiles)}`);
say(`{{PACKAGE_DOC_RE}}    ${isMonorepo ? '/^packages\\/[^/]+\\/CLAUDE\\.md$/' : '/^$/  (not a packages/ monorepo — see lessons.md)'}`);
say(`{{MIN_LIVING_DOCS}}   ${Math.max(1, Math.floor(livingDocs.length * 0.5))}   (~half of ${livingDocs.length} found; a floor, not a target)`);
say(`{{DEFAULT_BRANCH}}    ${defaultBranch}`);
say(`{{FEATURE_BRANCH_RE}} /^(feat|feature)\\//`);
say(`{{FEATURE_CODE_RE}}   ${isMonorepo ? '/^(packages\\/[^/]+\\/src\\/)/' : `/^(${anchorRoots.map(r => r.replace('/', '\\\\/')).join('|')})/`}`);
say(`{{FEATURE_DOC_RE}}    /^docs\\/features\\/.+\\.md$/`);
say(`{{BRANCH_EVIDENCE}}   ${branchEvidence}`);
say(`{{MIRROR_MAP}}        ${mirrorCandidates.length ? JSON.stringify(mirrorCandidates) : '(no .claude/ + .agent/ pair — DROP mirrorParity.js entirely)'}`);
say('```');
say('');
say('## Repo shape');
say(`- monorepo: ${isMonorepo ? `yes — packages: ${packages.join(', ')}` : 'no'}`);
say(`- module system: ${moduleSystem}${jestVer ? ` (jest ${jestVer}${jestCfg ? '' : ', no jest config found'})` : ''}`);
say(`- CI: ${ci}`);
say(`- lint: ${lintVerdict}`);
say(`- .claude/: ${hasClaude ? 'yes' : 'no'}   .agent/: ${hasAgent ? 'yes' : 'no'}`);
say(`- living docs found: ${livingDocs.length}`);
say('');
say('## Citation corpus');
say(`- total citations in living docs: ${cites.length}`);
say(`- root-anchored (checkable):      ${anchored.length}  (${pct}%)`);
say(`- unanchored (silently skipped):  ${cites.length - anchored.length}`);
if (cites.length && pct < 15) {
  flags.push(
    `only ${pct}% of citations are root-anchored — the gate would check almost nothing on day one. ` +
      'Decide with the user: accept it as a forward-only convention, or re-anchor the corpus first.'
  );
}
say('');
say(`## Baseline debt — ${debt.length} dead citation(s) TODAY`);
if (debt.length) {
  debt.slice(0, 40).forEach(d => say(`  ${d}`));
  if (debt.length > 40) say(`  … ${debt.length - 40} more`);
  say('');
  say('  Every one must be fixed (or `citation-skip`-ed with a reason) BEFORE the job blocks,');
  say('  or the first MR to touch this repo fails for someone else\'s rot.');
  say('  Past-EOF hits are often artifacts of probing a branch shorter than the doc assumed —');
  say('  re-run this probe against the branch the gate will actually target.');
} else {
  say('  none — the gate can go blocking immediately.');
}
say('');
say(`## Skills missing justification — ${skillsMissing.length} of ${skillFiles.length}`);
skillsMissing.forEach(f => say(`  ${f}`));
if (skillsMissing.length) {
  say('  Each needs a real `trigger:` and `why-not-claude-md:` written by someone who knows the');
  say('  domain. Do not bulk-generate these — a fabricated justification is worse than none.');
}
say('');
say(`## Red flags — ${flags.length}`);
flags.forEach(f => say(`  ! ${f}`));
if (!flags.length) say('  none.');

console.log(out.join('\n'));
