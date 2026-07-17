/* eslint-disable no-console */
/**
 * Enforce that `.agent/` is a byte-exact mirror of `.claude/`.
 *
 * `.agent/` is a hand-copied mirror with no sync script, so drift is silent. Two holes that
 * mattered, both closed by making drift itself the failure:
 *
 *  1. `.agent/skills/**` bypassed the whole gate. The skill gate globs `.claude/skills/**` and
 *     isLiving() has no `.agent/` entry, so every file under `.agent/skills/` was never justified
 *     and never citation-checked. A skill pack added ONLY under `.agent/skills/` needed no
 *     justification at all — the exact incident (a wholesale copied pack) this gate exists to
 *     prevent, reopened one directory over.
 *  2. The scaffold's own steps hand-copy `.claude/` -> `.agent/`. A human eventually forgets.
 *
 * Parity is enforced instead of extending the globs to `.agent/` because the mirror is a copy, not
 * a second source: a skill edited in both places would yield duplicate findings against what is
 * literally the same text, and — the real point — two independently-checked copies can both be
 * green while disagreeing with each other. Since `.claude/` is already skill-gated and
 * citation-checked, byte-identical parity covers `.agent/` transitively, and drift stops being
 * something the gate has to be taught to notice.
 *
 * `.claude/hooks/` is deliberately absent from the map: it has no `.agent/` counterpart by design.
 */

// .claude dir -> .agent dir. The rename is the scaffold's, not ours.
const MIRROR_MAP = {{MIRROR_MAP}};

function mapPath(file, from, to) {
  return to + file.slice(from.length);
}

function mirrorOf(file) {
  for (const [claudeDir, agentDir] of MIRROR_MAP) {
    if (file.indexOf(claudeDir) === 0) return mapPath(file, claudeDir, agentDir);
    if (file.indexOf(agentDir) === 0) return mapPath(file, agentDir, claudeDir);
  }
  return null;
}

function isMirrored(file) {
  return MIRROR_MAP.some(pair => file.indexOf(pair[0]) === 0 || file.indexOf(pair[1]) === 0);
}

/**
 * @param files {Array<{path: string, content: string}>} every tracked file under a mapped dir, both trees
 */
function analyzeMirrorParity({files}) {
  const byPath = new Map((files || []).map(f => [f.path, f.content]));
  const findings = [];
  const stats = {pairs: 0, claudeFiles: 0, agentFiles: 0};

  (files || []).forEach(file => {
    const isClaude = MIRROR_MAP.some(pair => file.path.indexOf(pair[0]) === 0);
    if (isClaude) stats.claudeFiles++;
    else stats.agentFiles++;

    const counterpart = mirrorOf(file.path);
    if (counterpart === null) return;

    if (!byPath.has(counterpart)) {
      findings.push({
        file: file.path,
        counterpart,
        reason: isClaude
          ? `not mirrored — ${counterpart} does not exist. Copy it, or the two trees disagree.`
          : `has no source at ${counterpart}. .agent/ is a mirror, not a source: add it under ` +
            `.claude/ (where the skill gate and citation check apply) and mirror it here.`
      });
      return;
    }

    if (isClaude) {
      stats.pairs++;
      if (byPath.get(counterpart) !== file.content) {
        findings.push({
          file: file.path,
          counterpart,
          reason: `drifted from its mirror ${counterpart} — the two copies are not identical`
        });
      }
    }
  });

  return {findings, stats};
}

function main() {
  const ctx = require('./gitContext');
  const fs = require('fs');
  const path = require('path');

  const files = ctx
    .listTrackedFiles()
    .filter(isMirrored)
    .filter(f => fs.existsSync(path.join(ctx.REPO_ROOT, f)))
    .map(p => ({path: p, content: fs.readFileSync(path.join(ctx.REPO_ROOT, p), 'utf8')}));

  // Fail closed, same reasoning as listLivingDocs(): a truncated scan must not read as parity.
  // A healthy tree has 84 files (42 pairs); the floor sits well below that so ordinary churn
  // never trips it, while a scan collapsing toward zero always does.
  const MIN_MIRRORED_FILES = 20;
  if (files.length < MIN_MIRRORED_FILES) {
    throw new Error(
      `docs-gate: found only ${files.length} mirrored files (expected >= ${MIN_MIRRORED_FILES}) — ` +
        'refusing to pass on what looks like an empty or truncated scan'
    );
  }

  const {findings, stats} = analyzeMirrorParity({files});

  console.log(
    `docs-gate/mirror-parity: ${stats.pairs} pair(s) compared | ` +
      `${stats.claudeFiles} .claude | ${stats.agentFiles} .agent`
  );
  findings.forEach(f => console.log(`  FAIL ${f.file} — ${f.reason}`));

  return findings.length;
}

if (require.main === module) {
  try {
    process.exit(main() > 0 ? 1 : 0);
  } catch (err) {
    console.error('docs-gate/mirror-parity FATAL', err);
    process.exit(1); // fail closed
  }
}

module.exports = {analyzeMirrorParity, mirrorOf, isMirrored, main, MIRROR_MAP};
