#!/usr/bin/env node
// Babel builds functions without resolving imports, so a pruned runtime dep only fails at deploy/cold start.
// `resolve-imports.mjs <workspaceDir>`: every bare specifier under <dir>/src must resolve from <dir>.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {builtinModules} from 'node:module';

const dir = path.resolve(process.argv[2]);
const req = createRequire(path.join(dir, 'package.json'));
const builtins = new Set(builtinModules.flatMap(m => [m, `node:${m}`]));
const re = /(?:from\s+|require\(\s*|import\(\s*)['"]([^'"./][^'"]*)['"]/g;

const specs = new Map();
const walk = d => {
  for (const e of fs.readdirSync(d, {withFileTypes: true})) {
    if (['node_modules', 'lib', '__tests__', '__mocks__'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(m?js|jsx|ts)$/.test(e.name)) {
      for (const m of fs.readFileSync(p, 'utf8').matchAll(re)) {
        const s = m[1];
        const pkg = s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0];
        if (builtins.has(s) || builtins.has(pkg) || pkg.startsWith('@functions')) continue;
        if (!specs.has(pkg)) specs.set(pkg, path.relative(dir, p));
      }
    }
  }
};
walk(path.join(dir, 'src'));

const missing = [];
for (const [pkg, where] of specs) {
  try {
    req.resolve(`${pkg}/package.json`);
  } catch {
    try {
      req.resolve(pkg);
    } catch {
      missing.push(`${pkg} (first seen ${where})`);
    }
  }
}
console.log(`${specs.size} packages imported, ${missing.length} unresolved`);
for (const m of missing) console.log('  ' + m);
process.exit(missing.length ? 1 : 0);
