// Stands in for jest in tests: runs each file after --runTestsByPath with node and prints
// jest's --json shape, which is all reproduce reads.
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const i = process.argv.indexOf('--runTestsByPath');
const files = i > -1 ? process.argv.slice(i + 1) : [];
const testResults = files.map(f => {
  const r = spawnSync(process.execPath, [f], {cwd: process.cwd()});
  const ok = r.status === 0;
  return {name: path.resolve(f), status: ok ? 'passed' : 'failed',
    assertionResults: [{status: ok ? 'passed' : 'failed', fullName: `${f} works`}]};
});
const success = testResults.every(t => t.status === 'passed');
console.log(JSON.stringify({success, numTotalTests: files.length, numTotalTestSuites: files.length, testResults}));
process.exit(success ? 0 : 1);
