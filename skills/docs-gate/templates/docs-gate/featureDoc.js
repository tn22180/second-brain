/* eslint-disable no-console */
/**
 * Require a feature doc on feature branches.
 *
 * Gates on the branch prefix, not the commit subject. Measured in this repo: {{BRANCH_EVIDENCE}}
 * Re-measure before trusting this choice in a repo that names branches differently.
 */

const FEATURE_BRANCH_RE = {{FEATURE_BRANCH_RE}};
const FEATURE_CODE_RE = {{FEATURE_CODE_RE}};
const TEST_FILE_RE = /(__tests__\/|\.(test|spec)\.jsx?$)/;
const FEATURE_DOC_RE = {{FEATURE_DOC_RE}};
// Anchored at line start (/m, so it holds whether the caller passes whole messages or the
// per-line list gitContext produces). An unanchored match fired on ANY line of ANY commit body, so
// a commit that merely mentions or quotes an earlier "[no-docs]" commit exempted the whole branch.
// The marker must be what the line SAYS, not something the line talks about: mid-line prose
// ("reverting the [no-docs] commit") and indented quotations no longer escape the gate.
const NO_DOCS_RE = /^\[no-docs]/m;

function analyzeFeatureDoc({branch, changedFiles, presentChangedFiles, commitMessages}) {
  const stats = {gated: false, featureFiles: 0, escaped: false, unknownBranch: false};

  // An empty branch is not "not a feature branch" — `git branch --show-current` returns '' on a
  // detached HEAD (and a caller could hand us undefined/null too), which tells us nothing about
  // whether this commit belongs to a feat/* branch. The old code ran '' through
  // FEATURE_BRANCH_RE, which never matches an empty string, so it took the same silent "not
  // gated" exit as a real fix/chore/whatever branch. That is a guess dressed up as a check: a
  // detached-HEAD checkout with brand-new, undocumented feature code went green. Fail closed
  // instead — an undeterminable branch is always a finding, independent of what changed, because
  // we cannot rule out that it needed gating.
  if (!branch) {
    stats.unknownBranch = true;
    return {
      findings: [
        {
          reason:
            'branch could not be determined (empty — usually a detached HEAD, or ' +
            'CI_MERGE_REQUEST_SOURCE_BRANCH_NAME is unset outside a merge-request pipeline). The ' +
            'feature-doc gate cannot tell whether this is a feat/* branch, so it refuses to guess ' +
            'and pass silently. Checkout a named branch (e.g. `git checkout <branch>`) and re-run, ' +
            'or set CI_MERGE_REQUEST_SOURCE_BRANCH_NAME if this is running in CI.'
        }
      ],
      stats
    };
  }

  if (!FEATURE_BRANCH_RE.test(branch)) return {findings: [], stats};

  const featureFiles = (changedFiles || []).filter(
    f => FEATURE_CODE_RE.test(f) && !TEST_FILE_RE.test(f)
  );
  stats.featureFiles = featureFiles.length;
  if (featureFiles.length === 0) return {findings: [], stats};

  stats.gated = true;

  if ((commitMessages || []).some(m => NO_DOCS_RE.test(m))) {
    stats.escaped = true;
    return {findings: [], stats};
  }

  // Only a doc that still EXISTS at HEAD can satisfy the gate — deleting docs/features/sitemap.md
  // is not documenting the feature. `presentChangedFiles` is `changedFiles` minus deletions.
  // Defaulting to [] rather than falling back to `changedFiles` is deliberate: a caller that omits
  // the list fails the gate instead of silently restoring the bypass. Fail closed.
  const present = presentChangedFiles || [];
  if (present.some(f => FEATURE_DOC_RE.test(f))) return {findings: [], stats};

  return {
    findings: [
      {
        reason:
          `branch "${branch}" changes ${featureFiles.length} feature file(s) but no ` +
          `docs/features/*.md. Run /docs, or add [no-docs] to a commit message with a reason.`
      }
    ],
    stats
  };
}

function main() {
  const ctx = require('./gitContext');
  const base = ctx.diffBase();
  const {findings, stats} = analyzeFeatureDoc({
    branch: ctx.currentBranch(),
    changedFiles: ctx.changedFiles(base),
    presentChangedFiles: ctx.presentChangedFiles(base),
    commitMessages: ctx.commitMessages(base)
  });

  console.log(
    `docs-gate/feature-doc: gated=${stats.gated} featureFiles=${stats.featureFiles} ` +
      `escaped=${stats.escaped} unknownBranch=${stats.unknownBranch}`
  );
  findings.forEach(f => console.log(`  FAIL ${f.reason}`));

  return findings.length;
}

if (require.main === module) {
  try {
    process.exit(main() > 0 ? 1 : 0);
  } catch (err) {
    console.error('docs-gate/feature-doc FATAL', err);
    process.exit(1);
  }
}

module.exports = {analyzeFeatureDoc, main, FEATURE_BRANCH_RE, FEATURE_CODE_RE};
