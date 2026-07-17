/* eslint-disable no-console */
/**
 * Force a new or changed skill to justify itself in writing.
 *
 * A bash script cannot judge "a trigger CLAUDE.md cannot imply". It enforces the form and
 * makes the author supply the substance, visible in the MR diff. When joy's skill pack was
 * copied into this repo, nobody had to write a single line of justification.
 */

const {parseCitations, isAnchored} = require('./citations');

const REQUIRED_KEYS = ['trigger', 'why-not-claude-md'];
// Two different anchoring rules, because the two marker families behave differently in real text:
//  - TODO / TBD / N/A are unambiguous stubs wherever they OPEN the value — "TODO fill in later"
//    is still boilerplate. These stay prefix-anchored (marker, then whitespace-or-end-of-string).
//  - `<...>` and `...` are NOT unambiguous — they occur inside real justification prose too
//    ("<script> injection is the exact vector this skill defends against", "... continues the
//    roadmap doc scoped decision to split this out"). They only mean "placeholder" when they ARE
//    the entire value ("<describe when this fires>", "..." alone). So these two are anchored at
//    both ends — the value must match them in full, not merely start with them.
// This still judges form, not substance: a real sentence that happens to open with "<foo>" or
// "..." is not rejected just because it contains a marker character.
const BOILERPLATE_RE = /^(?:(?:TODO|TBD|N\/A)(?:\s|$)|(?:<[^>]*>|\.\.\.)$)/i;
const OVERLAP_WARN_THRESHOLD = 0.5;
const BLOCK_SCALAR_RE = /^([>|])([+-]?)$/;

// Handles YAML block scalars (folded `>` and literal `|`, with `-`/`+` chomping indicators) in
// addition to plain `key: value` lines. This repo's own skills use the folded form for long
// justification text (see .claude/skills/bigquery-billing/SKILL.md) — without this, a wrapped
// `trigger: >` parsed to the literal string ">" and sailed through the boilerplate check empty.
function parseFrontmatter(content) {
  const match = String(content).match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const lines = match[1].split('\n');
  const out = {};
  let i = 0;

  while (i < lines.length) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }

    const key = kv[1];
    const rest = kv[2].trim();
    i++;

    const blockScalar = rest.match(BLOCK_SCALAR_RE);
    if (!blockScalar) {
      // A bare `key:` may open a YAML sequence, which is a real, filled-in value written across the
      // following indented `- item` lines. Without this it parses to '' and is reported as "missing
      // or empty" against a skill that did nothing wrong — the block-scalar hole's mirror image:
      // that one passes junk, this one fails good work, and the second is what gets a gate switched
      // off. Items are joined into one string because the gate judges only that a justification
      // exists, never what it says. Indentation is required, so a top-level list is not slurped.
      if (rest === '') {
        const items = [];
        while (i < lines.length) {
          const item = lines[i].match(/^\s+-\s+(.*)$/);
          if (!item) break;
          items.push(item[1].trim());
          i++;
        }
        if (items.length > 0) {
          out[key] = items.join(', ');
          continue;
        }
      }
      out[key] = rest;
      continue;
    }

    const [, style, chomp] = blockScalar;
    const blockLines = [];
    let indent = null;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        blockLines.push('');
        i++;
        continue;
      }

      const leading = line.length - line.trimStart().length;
      if (indent === null) {
        if (leading === 0) break;
        indent = leading;
      } else if (leading < indent) {
        break;
      }

      blockLines.push(line.slice(indent));
      i++;
    }

    // Default (clip) and "-" (strip) chomping both drop trailing blank lines for our purposes —
    // this isn't a full YAML implementation, just enough to stop a wrapped value from parsing
    // to a bare indicator. "+" (keep) preserves them.
    while (chomp !== '+' && blockLines.length && blockLines[blockLines.length - 1] === '') {
      blockLines.pop();
    }

    out[key] = style === '>' ? blockLines.filter(l => l !== '').join(' ') : blockLines.join('\n');
  }

  return out;
}

function analyzeSkillGate({skills, alwaysLoadedPaths}) {
  const alwaysLoaded = new Set(alwaysLoadedPaths || []);
  const findings = [];
  const stats = {checked: 0, warnings: []};

  (skills || []).forEach(skill => {
    stats.checked++;
    const fm = parseFrontmatter(skill.content);

    if (!fm) {
      findings.push({skill: skill.path, reason: 'no YAML frontmatter'});
      return;
    }

    REQUIRED_KEYS.forEach(key => {
      const value = fm[key];
      if (value === undefined || value === '') {
        findings.push({
          skill: skill.path,
          reason: `frontmatter key "${key}" is missing or empty — a skill must justify its place`
        });
      } else if (BOILERPLATE_RE.test(value)) {
        findings.push({
          skill: skill.path,
          reason: `frontmatter key "${key}" is still boilerplate ("${value}")`
        });
      }
    });

    const cited = parseCitations(skill.content)
      .filter(c => isAnchored(c.path))
      .map(c => c.path);
    const unique = Array.from(new Set(cited));
    if (unique.length > 0) {
      const overlap = unique.filter(p => alwaysLoaded.has(p)).length / unique.length;
      if (overlap > OVERLAP_WARN_THRESHOLD) {
        stats.warnings.push(
          `${skill.path}: ${Math.round(overlap * 100)}% of cited files are already cited by an ` +
            `always-loaded file — this may belong in CLAUDE.md, not a skill`
        );
      }
    }
  });

  return {findings, stats};
}

function main() {
  const ctx = require('./gitContext');
  const fs = require('fs');
  const path = require('path');

  const base = ctx.diffBase();
  const changed = ctx
    .changedFiles(base)
    .filter(f => /^\.claude\/skills\/.*SKILL\.md$/.test(f))
    .filter(f => fs.existsSync(path.join(ctx.REPO_ROOT, f)));

  const skills = changed.map(p => ({
    path: p,
    content: fs.readFileSync(path.join(ctx.REPO_ROOT, p), 'utf8')
  }));

  const alwaysLoadedPaths = [];
  // resolveLivingFiles() expands packages/*/CLAUDE.md against the tracked set.
  // Reading ctx.LIVING_FILES directly would silently miss every package CLAUDE.md.
  ctx.resolveLivingFiles(ctx.listTrackedFiles()).forEach(f => {
    const abs = path.join(ctx.REPO_ROOT, f);
    if (!fs.existsSync(abs)) return;
    parseCitations(fs.readFileSync(abs, 'utf8'))
      .filter(c => isAnchored(c.path))
      .forEach(c => alwaysLoadedPaths.push(c.path));
  });

  const {findings, stats} = analyzeSkillGate({skills, alwaysLoadedPaths});

  console.log(`docs-gate/skill-gate: ${stats.checked} changed skill(s) checked`);
  stats.warnings.forEach(w => console.log(`  WARN ${w}`));
  findings.forEach(f => console.log(`  FAIL ${f.skill} — ${f.reason}`));

  return findings.length;
}

if (require.main === module) {
  try {
    process.exit(main() > 0 ? 1 : 0);
  } catch (err) {
    console.error('docs-gate/skill-gate FATAL', err);
    process.exit(1);
  }
}

module.exports = {parseFrontmatter, analyzeSkillGate, main, REQUIRED_KEYS};
