/* eslint-disable no-console */
/**
 * Citation parsing for the docs gate.
 *
 * A citation is a `path:line` or `path:start-end` reference inside a living doc.
 * Only root-anchored paths ({{ANCHOR_ROOTS_PROSE}}) are checkable. Suffix matching is rejected:
 * see references/lessons.md in the docs-gate skill for the measurement that killed it.
 */

const ANCHOR_ROOTS = {{ANCHOR_ROOTS}};

const EXT = String.raw`\.(?:js|jsx|mjs|ts|tsx|json|yml|yaml|sh|md|toml|rules|liquid)`;
// {{DOTFILE_TOKEN}}: root dotfiles the docs cite, listed EXPLICITLY. A generic `\.?` prefix on
// FILE_TOKEN looks equivalent and is not — in the prose `...packages/a.js:5` it matches the last
// ellipsis dot, yields the unanchored path `.packages/a.js`, and silently turns a checked citation
// into an invisible one. Alternation is leftmost-first, so `.gitlab-ci.yml:216` matches whole.
// Each dotfile listed here must ALSO be added to ANCHOR_ROOTS, or it parses and is dropped anyway.
// Safe only for unique root files nobody writes document-relative. Never package.json.
// No dotfile citations in the corpus? Set this to a pattern that cannot match: (?!)
const DOTFILE_TOKEN = String.raw`{{DOTFILE_TOKEN}}`;
const FILE_TOKEN = String.raw`[A-Za-z0-9_][A-Za-z0-9_./-]*` + EXT;
const CITATION_PATTERN = `(?:${DOTFILE_TOKEN}|${FILE_TOKEN})` + String.raw`:(\d+)(?:-(\d+))?`;
const SKIP_RE = /<!--\s*citation-skip:\s*(.*?)\s*-->/;
const SKIP_RE_G = /<!--\s*citation-skip:\s*(.*?)\s*-->/g;

function isAnchored(filePath) {
  return ANCHOR_ROOTS.some(root => filePath.indexOf(root) === 0);
}

// One skip comment exempts ONE citation, not the whole line. The old rule matched the line, so a
// single reason silenced every citation on it — three dead citations and one comment reported
// "1 skip" while three were exempt. The escape hatch has to be as narrow as the justification it
// forces. Attribution:
//   - exactly one citation on the line -> any skip comment on that line exempts it. This is the
//     documented syntax and the only form in the corpus, so it keeps working unchanged.
//   - two or more -> each comment exempts the nearest citation that PRECEDES it, so a reason is
//     written per citation: `a.js:1 <!-- citation-skip: r1 --> b.js:2 <!-- citation-skip: r2 -->`.
// Citations appearing inside a skip comment's own text are not citations at all (a reason may
// legitimately name the dead path) and are dropped.
function parseCitations(content) {
  const out = [];
  const lines = String(content).split('\n');

  lines.forEach((line, index) => {
    const skips = [];
    let skipMatch;
    SKIP_RE_G.lastIndex = 0;
    while ((skipMatch = SKIP_RE_G.exec(line)) !== null) {
      skips.push({
        start: skipMatch.index,
        end: skipMatch.index + skipMatch[0].length,
        reason: skipMatch[1]
      });
    }

    const cites = [];
    const re = new RegExp(CITATION_PATTERN, 'g');
    let match;
    while ((match = re.exec(line)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (skips.some(s => start >= s.start && end <= s.end)) continue;

      cites.push({
        path: match[0].replace(/:\d+(?:-\d+)?$/, ''),
        startLine: parseInt(match[1], 10),
        endLine: match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10),
        docLine: index + 1,
        start,
        end,
        skipped: false,
        skipReason: null
      });
    }

    if (cites.length === 1 && skips.length > 0) {
      cites[0].skipped = true;
      cites[0].skipReason = skips[0].reason;
    } else if (cites.length > 1) {
      skips.forEach(skip => {
        let target = null;
        cites.forEach(cite => {
          if (cite.end <= skip.start) target = cite;
        });
        if (target && !target.skipped) {
          target.skipped = true;
          target.skipReason = skip.reason;
        }
      });
    }

    cites.forEach(cite => {
      delete cite.start;
      delete cite.end;
      out.push(cite);
    });
  });

  return out;
}

function analyzeCitations({docs, trackedFiles, lineCountOf}) {
  const tracked = new Set(trackedFiles);
  const findings = [];
  const stats = {anchored: 0, shorthand: 0, skipped: 0};

  docs.forEach(doc => {
    parseCitations(doc.content).forEach(cite => {
      // Classify BEFORE honouring the skip. stats.skipped used to be incremented first, so it
      // mixed two unrelated classes: an anchored citation someone deliberately exempted, and a
      // shorthand citation that was never checkable in the first place. Only the former is a use
      // of the escape hatch, and that is the number the spec promises is greppable and countable.
      // Skipping a shorthand citation is a no-op; counting it as shorthand keeps `skipped` honest.
      if (!isAnchored(cite.path)) {
        stats.shorthand++;
        return;
      }
      if (cite.skipped) {
        stats.skipped++;
        return;
      }

      stats.anchored++;
      // Show the span the doc actually wrote. Labelling `a.js:99-105` as `a.js:99` sends whoever
      // triages the finding to a line the doc never cited.
      const label =
        cite.endLine === cite.startLine
          ? `${cite.path}:${cite.startLine}`
          : `${cite.path}:${cite.startLine}-${cite.endLine}`;

      if (!tracked.has(cite.path)) {
        findings.push({
          doc: doc.path,
          docLine: cite.docLine,
          citation: label,
          reason: `path not tracked in git`
        });
        return;
      }

      const total = lineCountOf(cite.path);
      if (cite.endLine > total) {
        findings.push({
          doc: doc.path,
          docLine: cite.docLine,
          citation: label,
          reason: `line ${cite.endLine} past end of file — ${cite.path} has ${total} lines`
        });
      }
    });
  });

  return {findings, stats};
}

function main() {
  const ctx = require('./gitContext');
  const trackedFiles = ctx.listTrackedFiles();
  const docs = ctx.listLivingDocs(trackedFiles);
  const {findings, stats} = analyzeCitations({docs, trackedFiles, lineCountOf: ctx.lineCountOf});

  console.log(
    `docs-gate/citations: ${docs.length} living docs | ` +
      `${stats.anchored} anchored checked | ${stats.shorthand} shorthand skipped | ` +
      `${stats.skipped} explicitly skipped`
  );
  findings.forEach(f => console.log(`  FAIL ${f.doc}:${f.docLine}  ${f.citation}  — ${f.reason}`));

  return findings.length;
}

if (require.main === module) {
  try {
    process.exit(main() > 0 ? 1 : 0);
  } catch (err) {
    console.error('docs-gate/citations FATAL', err);
    process.exit(1); // fail closed
  }
}

module.exports = {
  parseCitations,
  isAnchored,
  analyzeCitations,
  ANCHOR_ROOTS,
  CITATION_PATTERN,
  main
};
