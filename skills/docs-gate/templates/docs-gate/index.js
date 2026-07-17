/* eslint-disable no-console */
/**
 * Runs every docs-gate check and fails on the first non-zero total.
 *
 * Usage:  yarn docs-gate       (locally, against origin/master)
 *         node scripts/docs-gate/index.js   (CI, against CI_MERGE_REQUEST_DIFF_BASE_SHA)
 */

const CHECKS = [
  ['citations', require('./citations').main],
  ['feature-doc', require('./featureDoc').main],
  ['skill-gate', require('./skillGate').main],
  ['mirror-parity', require('./mirrorParity').main]
];

function run() {
  let failures = 0;

  CHECKS.forEach(entry => {
    const name = entry[0];
    const check = entry[1];
    try {
      failures += check();
    } catch (err) {
      console.error(`docs-gate/${name} FATAL`, err);
      failures += 1; // fail closed — a crash is never a pass
    }
  });

  return failures;
}

if (require.main === module) {
  const failures = run();
  console.log(failures === 0 ? '\ndocs-gate: PASS' : `\ndocs-gate: FAIL (${failures} finding(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

module.exports = {run};
