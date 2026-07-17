/* eslint-disable no-console */
/**
 * Impure git/fs access for the docs gate. Kept out of the pure cores so the
 * cores stay testable without a repo.
 */

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Living docs describe current code and must stay true.
// docs/superpowers/{specs,plans} are dated records and are deliberately excluded.
const LIVING_DIRS = {{LIVING_DIRS}};
// Root-level exact matches only. Per-package CLAUDE.md files are matched by the
// packages/<pkg>/CLAUDE.md glob in isLiving() below, not enumerated here — otherwise a new
// package's CLAUDE.md is silently excluded from the gate until someone remembers to add it here.
const LIVING_FILES = {{LIVING_FILES}};
const PACKAGE_CLAUDE_MD_RE = {{PACKAGE_DOC_RE}};

function git(args) {
  return execFileSync('git', args, {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
}

function listTrackedFiles() {
  return git(['ls-files'])
    .split('\n')
    .filter(Boolean);
}

function isLiving(file) {
  if (LIVING_FILES.indexOf(file) !== -1) return true;
  if (PACKAGE_CLAUDE_MD_RE.test(file)) return true;
  return LIVING_DIRS.some(dir => file.indexOf(dir) === 0 && file.endsWith('.md'));
}

// LIVING_FILES alone no longer lists every always-loaded root/package doc (see above) — a later
// task (the skill gate) reads that full set, so give it a resolved list instead of the narrowed
// constant. Derived from tracked files so it reflects whichever packages actually have a
// CLAUDE.md right now, not a hardcoded guess.
function resolveLivingFiles(trackedFiles) {
  const packageClaudeFiles = trackedFiles.filter(f => PACKAGE_CLAUDE_MD_RE.test(f));
  return LIVING_FILES.concat(packageClaudeFiles);
}

function listLivingDocs(trackedFiles) {
  const docs = trackedFiles.filter(isLiving).map(p => ({
    path: p,
    content: fs.readFileSync(path.join(REPO_ROOT, p), 'utf8')
  }));
  // Fail closed (plan's Global Constraints: "a crash is never a pass"). On this branch a healthy
  // scan finds 31 living docs. An empty/truncated tracked-file scan (bad cwd, a swallowed git
  // failure upstream, a stubbed listTrackedFiles) must not silently collapse to
  // "0 living docs | 0 anchored checked | exit 0" — that reads as a pass. The floor is set well
  // below the real count so ordinary doc churn (adding/removing a handful of docs) never trips
  // it, while a scan collapsing toward zero always does.
  const MIN_LIVING_DOCS = {{MIN_LIVING_DOCS}};
  if (docs.length < MIN_LIVING_DOCS) {
    throw new Error(
      `docs-gate: found only ${docs.length} living docs (expected >= ${MIN_LIVING_DOCS}) — ` +
        'refusing to pass on what looks like an empty or truncated scan'
    );
  }
  return docs;
}

// Line count with `wc -l` semantics for the common case: a trailing newline TERMINATES the last
// line, it does not start a new empty one. The naive split('\n').length returns lines+1 for every
// POSIX-style file, which made the gate accept a citation one line past EOF — e.g.
// worker.config.yml is 220 lines but reported 221, so `worker.config.yml:50-221` passed while
// line 221 does not exist. Only the final empty element is dropped: a file genuinely ending in a
// blank line ("a\n\n") is 2 lines, and a file with no trailing newline ("a") is 1.
const lineCache = {};
function lineCountOf(file) {
  if (lineCache[file] === undefined) {
    const lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    lineCache[file] = lines.length;
  }
  return lineCache[file];
}

function currentBranch() {
  return (
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || git(['branch', '--show-current']).trim()
  );
}

// The target is NOT always master — MR !1994 targets feat/worker-pubsub-migration.
function diffBase() {
  if (process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA) return process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA;
  const target = process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || '{{DEFAULT_BRANCH}}';
  return git(['merge-base', 'HEAD', `origin/${target}`]).trim();
}

function changedFiles(baseSha) {
  return git(['diff', '--name-only', `${baseSha}..HEAD`])
    .split('\n')
    .filter(Boolean);
}

// changedFiles() lists deletions too, and `git diff --name-only` gives no way to tell them apart.
// That let a deleted feature doc satisfy the feature-doc check: a feat/* branch could delete every
// doc in docs/features/ and go green, because the deletion IS the "changed docs/features/*.md".
// `--diff-filter=d` (lowercase = exclude) drops deletions, so this is the subset that still exists
// at HEAD. The pure core takes both lists: deletions still count as touching feature code, but
// only a doc that survives can satisfy the gate.
function presentChangedFiles(baseSha) {
  return git(['diff', '--name-only', '--diff-filter=d', `${baseSha}..HEAD`])
    .split('\n')
    .filter(Boolean);
}

function commitMessages(baseSha) {
  return git(['log', '--format=%B', `${baseSha}..HEAD`])
    .split('\n')
    .filter(Boolean);
}

module.exports = {
  REPO_ROOT,
  LIVING_DIRS,
  LIVING_FILES,
  isLiving,
  resolveLivingFiles,
  listTrackedFiles,
  listLivingDocs,
  lineCountOf,
  currentBranch,
  diffBase,
  changedFiles,
  presentChangedFiles,
  commitMessages
};
