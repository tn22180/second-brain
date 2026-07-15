#!/usr/bin/env node
/**
 * avada-agent-scaffold — stamp an Avada agent-support layer into a Shopify app repo.
 *
 * Merge-safe: never clobbers CLAUDE.md / settings.local.json / existing files
 * (unless --force, which still refuses CLAUDE.md + settings.local.json).
 *
 * Usage:
 *   node scaffold.mjs --repo /path/to/app [--dry-run] [--force]
 *                     [--only agents,commands,hooks,skills,rules,cursorrules,docs]
 *                     [--domains worker-fleet,sitemap,image-optimization,...]
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const TPL = path.join(SKILL_ROOT, 'templates');
const TPL_CLAUDE = path.join(TPL, 'claude');

// ---- args -----------------------------------------------------------------
function parseArgs(argv) {
  const a = {repo: process.cwd(), dryRun: false, force: false, only: null, domains: []};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') a.dryRun = true;
    else if (arg === '--force') a.force = true;
    else if (arg === '--repo') a.repo = path.resolve(argv[++i]);
    else if (arg === '--only') a.only = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--domains') a.domains = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));

// Standard layer/support dirs — NOT domain skills.
const STD_SRC_DIRS = new Set([
  'handlers', 'controllers', 'services', 'repositories', 'presenters', 'helpers',
  'const', 'config', 'routes', 'middleware', 'middlewares', 'graphql', 'transformers',
  'types', 'commands', 'docs', 'resources', 'exports', 'utils', 'lib', 'schemas',
]);
const GENERIC_SKILLS = new Set(fs.existsSync(path.join(TPL_CLAUDE, 'skills'))
  ? fs.readdirSync(path.join(TPL_CLAUDE, 'skills')) : []);

// ---- scan target repo -----------------------------------------------------
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function scanRepo(repo) {
  const out = {appName: path.basename(repo), prodProject: '', stagingProjects: [], packages: [], domains: []};

  const pkgJson = readJson(path.join(repo, 'package.json'));
  if (pkgJson?.name) out.appName = String(pkgJson.name).replace(/^@[^/]+\//, '');

  const firebaserc = readJson(path.join(repo, '.firebaserc'));
  if (firebaserc?.projects) {
    const proj = firebaserc.projects;
    // Real prod is the `production`/`prod` alias if present; `default` is usually a staging alias.
    const prodKey = ['production', 'prod'].find(k => proj[k]);
    out.prodProject = prodKey ? proj[prodKey] : (proj.default || '');
    // Staging = every other alias, value-deduped, with the prod value excluded.
    const seen = new Set(out.prodProject ? [out.prodProject] : []);
    out.stagingProjects = Object.entries(proj)
      .filter(([k]) => k !== 'default' && k !== prodKey)
      .map(([, v]) => v)
      .filter(v => v && !seen.has(v) && seen.add(v));
  }

  const pkgDir = path.join(repo, 'packages');
  if (fs.existsSync(pkgDir)) {
    out.packages = fs.readdirSync(pkgDir, {withFileTypes: true})
      .filter(d => d.isDirectory()).map(d => d.name);
  }

  // Candidate domains: non-standard top-level dirs under functions/src + worker jobs.
  const srcDir = path.join(repo, 'packages', 'functions', 'src');
  const candidates = new Set();
  if (fs.existsSync(srcDir)) {
    for (const d of fs.readdirSync(srcDir, {withFileTypes: true})) {
      if (d.isDirectory() && !STD_SRC_DIRS.has(d.name)) candidates.add(d.name);
    }
  }
  const workerCfg = path.join(repo, 'packages', 'functions', 'worker.config.yml');
  if (fs.existsSync(workerCfg)) candidates.add('worker-fleet');
  out.domains = [...candidates];
  return out;
}

// ---- placeholder fill -----------------------------------------------------
function fill(text, map) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

// ---- planning / writing ---------------------------------------------------
const PROTECTED = new Set(['CLAUDE.md', 'settings.local.json']);
const plan = [];   // {action:'write'|'skip'|'merge', dest, note}

function isProtected(dest) { return PROTECTED.has(path.basename(dest)); }

function planWrite(destAbs, content, {executable = false} = {}) {
  const rel = path.relative(args.repo, destAbs);
  if (isProtected(destAbs)) { plan.push({action: 'skip', dest: rel, note: 'protected (hand-owned)'}); return; }
  const exists = fs.existsSync(destAbs);
  if (exists && !args.force) { plan.push({action: 'skip', dest: rel, note: 'exists'}); return; }
  plan.push({action: exists ? 'overwrite' : 'write', dest: rel, note: executable ? '+x' : ''});
  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(destAbs), {recursive: true});
    fs.writeFileSync(destAbs, content);
    if (executable) fs.chmodSync(destAbs, 0o755);
  }
}

// Copy a template dir into a dest dir, filling placeholders in text files.
function stampDir(srcDir, destDir, map, {executable = false} = {}) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, {withFileTypes: true})) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) { stampDir(s, d, map, {executable}); continue; }
    const raw = fs.readFileSync(s, 'utf8');
    planWrite(d, fill(raw, map), {executable});
  }
}

// ---- settings.json merge --------------------------------------------------
function mergeSettings(repo, map) {
  const dest = path.join(repo, '.claude', 'settings.json');
  const tplRaw = fs.readFileSync(path.join(TPL_CLAUDE, 'settings.json.tmpl'), 'utf8');
  const tpl = JSON.parse(fill(tplRaw, map));
  const rel = path.relative(repo, dest);

  const existing = readJson(dest);
  if (!existing) {
    plan.push({action: fs.existsSync(dest) ? 'overwrite' : 'write', dest: rel, note: 'new settings.json'});
    if (!args.dryRun) { fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.writeFileSync(dest, JSON.stringify(tpl, null, 2) + '\n'); }
    return;
  }
  // Deep-merge hooks: union hook commands per event, preserving existing entries.
  const merged = {...existing};
  merged.hooks = merged.hooks || {};
  const cmdOf = h => h?.command || JSON.stringify(h);
  for (const [event, groups] of Object.entries(tpl.hooks || {})) {
    const existingGroups = merged.hooks[event] || [];
    const existingCmds = new Set(existingGroups.flatMap(g => (g.hooks || []).map(cmdOf)));
    for (const group of groups) {
      const fresh = (group.hooks || []).filter(h => !existingCmds.has(cmdOf(h)));
      if (!fresh.length) continue;
      const match = existingGroups.find(g => (g.matcher || '') === (group.matcher || ''));
      if (match) { match.hooks = [...(match.hooks || []), ...fresh]; }
      else { existingGroups.push({...group, hooks: fresh}); }
    }
    merged.hooks[event] = existingGroups;
  }
  plan.push({action: 'merge', dest: rel, note: 'hooks unioned'});
  if (!args.dryRun) fs.writeFileSync(dest, JSON.stringify(merged, null, 2) + '\n');
}

// ---- docs/ai-agent/README.md ----------------------------------------------
function renderDocsReadme(map, scan) {
  return `# AI Agent Scaffold — ${map.APP_NAME}

Generated by \`avada-agent-scaffold\`. This directory documents the Claude/agent support
layer for this repo. Edit the source under \`.claude/\`; the \`.agent/\` mirror and
\`.cursorrules\` are regenerated by re-running the scaffold.

## Layout

| Path | Purpose |
|------|---------|
| \`.claude/agents/\` | Specialist subagents (planner, code-reviewer, debugger, …) |
| \`.claude/commands/\` | Slash commands (/plan /review /commit /refactor …) |
| \`.claude/skills/\` | Domain skills — generic + app-specific |
| \`.claude/workflows/\` | Rules (development-rules, orchestration-protocol, primary-workflow) |
| \`.claude/hooks/\` | Guard hooks (block-dangerous-bash, block-tunnel-url, auto-lint, …) |
| \`.agent/\` | Harness-agnostic mirror (rules/agents/skills/workflows) |
| \`.cursorrules\` | Single-file Cursor rules |

## App context (detected)

- **Prod project:** ${map.PROD_PROJECT || '(none detected)'}
- **Staging projects:** ${scan.stagingProjects.join(', ') || '(none)'}
- **Packages:** ${scan.packages.join(', ') || '(none)'}

## App-specific skills

These were stubbed and need to be filled from this repo's \`PATTERNS.md\` / \`src/\`:

${(args.domains.length ? args.domains : scan.domains).map(d => `- \`.claude/skills/${d}/SKILL.md\` — TODO`).join('\n') || '- (none)'}

## Regenerate

\`\`\`bash
node ~/.claude/skills/avada-agent-scaffold/scripts/scaffold.mjs --repo "${map.APP_NAME}" --dry-run
\`\`\`
`;
}

// ---- domain skill stubs ---------------------------------------------------
function stampStubs(repo, map) {
  const stubTpl = path.join(TPL, 'domain-stubs', 'SKILL.md.tmpl');
  if (!fs.existsSync(stubTpl)) return;
  const raw = fs.readFileSync(stubTpl, 'utf8');
  const domains = args.domains.length ? args.domains : [];
  for (const domain of domains) {
    if (GENERIC_SKILLS.has(domain)) continue; // don't stub over a generic skill
    const dmap = {...map, DOMAIN: domain, DOMAIN_TITLE: titleCase(domain)};
    for (const base of ['.claude', '.agent']) {
      const dest = path.join(repo, base, 'skills', domain, 'SKILL.md');
      planWrite(dest, fill(raw, dmap));
    }
  }
}
function titleCase(s) { return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

// ---- main -----------------------------------------------------------------
function want(section) { return !args.only || args.only.includes(section); }

function main() {
  if (!fs.existsSync(args.repo)) { console.error(`repo not found: ${args.repo}`); process.exit(1); }
  const scan = scanRepo(args.repo);
  const map = {
    APP_NAME: scan.appName,
    PROD_PROJECT: scan.prodProject,
    STAGING_PROJECTS: scan.stagingProjects.join(', '),
    PACKAGES: scan.packages.join(', '),
    DOMAINS: (args.domains.length ? args.domains : scan.domains).join(', '),
  };

  const claude = path.join(args.repo, '.claude');
  const agent = path.join(args.repo, '.agent');

  // .claude/ (source of truth)
  if (want('agents'))     stampDir(path.join(TPL_CLAUDE, 'agents'),    path.join(claude, 'agents'), map);
  if (want('commands'))   stampDir(path.join(TPL_CLAUDE, 'commands'),  path.join(claude, 'commands'), map);
  if (want('skills'))     stampDir(path.join(TPL_CLAUDE, 'skills'),    path.join(claude, 'skills'), map);
  if (want('rules'))      stampDir(path.join(TPL_CLAUDE, 'workflows'), path.join(claude, 'workflows'), map);
  if (want('hooks'))      stampDir(path.join(TPL_CLAUDE, 'hooks'),     path.join(claude, 'hooks'), map, {executable: true});

  // .agent/ mirror — stamped from the SAME templates (naming remap, so no drift).
  if (want('agents'))     stampDir(path.join(TPL_CLAUDE, 'agents'),    path.join(agent, 'agents'), map);
  if (want('skills'))     stampDir(path.join(TPL_CLAUDE, 'skills'),    path.join(agent, 'skills'), map);
  if (want('rules'))      stampDir(path.join(TPL_CLAUDE, 'workflows'), path.join(agent, 'rules'), map);
  if (want('commands'))   stampDir(path.join(TPL_CLAUDE, 'commands'),  path.join(agent, 'workflows'), map);

  if (want('skills'))     stampStubs(args.repo, map);

  if (want('cursorrules')) {
    const raw = fs.readFileSync(path.join(TPL, 'cursorrules.tmpl'), 'utf8');
    planWrite(path.join(args.repo, '.cursorrules'), fill(raw, map));
  }
  if (want('docs')) {
    planWrite(path.join(args.repo, 'docs', 'ai-agent', 'README.md'), renderDocsReadme(map, scan));
  }
  if (want('hooks')) mergeSettings(args.repo, map);

  report(scan, map);
}

function report(scan, map) {
  const w = plan.filter(p => p.action === 'write').length;
  const o = plan.filter(p => p.action === 'overwrite').length;
  const s = plan.filter(p => p.action === 'skip').length;
  const m = plan.filter(p => p.action === 'merge').length;

  console.log(`\n=== avada-agent-scaffold ${args.dryRun ? '(DRY RUN)' : ''} ===`);
  console.log(`repo: ${args.repo}`);
  console.log(`app:  ${map.APP_NAME}   prod: ${map.PROD_PROJECT || '?'}   packages: ${map.PACKAGES || '?'}`);
  console.log(`\nPlanned: ${w} write, ${o} overwrite, ${m} merge, ${s} skip\n`);
  for (const p of plan) {
    const tag = {write: '  +', overwrite: '  ~', merge: '  ≈', skip: '  ·'}[p.action] || '  ?';
    console.log(`${tag} ${p.dest}${p.note ? `   (${p.note})` : ''}`);
  }

  // Gap checklist.
  const stubbed = args.domains.filter(d => !GENERIC_SKILLS.has(d)); // what was actually stubbed
  console.log('\n--- GAP CHECKLIST (app-specific work remaining) ---');
  if (stubbed.length) {
    console.log('Fill these domain skill stubs from this repo\'s PATTERNS.md / src/:');
    for (const d of stubbed) console.log(`  [ ] .claude/skills/${d}/SKILL.md`);
  } else {
    console.log('No domain stubs generated. Pass --domains a,b,c to stub app-specific skills.');
  }
  const suggestions = scan.domains.filter(d => !stubbed.includes(d));
  if (suggestions.length) {
    console.log(`Auto-detected domain candidates (pass via --domains to stub): ${suggestions.join(', ')}`);
  }
  for (const pkg of scan.packages) {
    const cm = path.join(args.repo, 'packages', pkg, 'CLAUDE.md');
    if (!fs.existsSync(cm)) console.log(`  [ ] write packages/${pkg}/CLAUDE.md`);
  }
  console.log('  [ ] add Which-skill / command / agent tables to root CLAUDE.md (generator won\'t touch it)');
  console.log(`\n${args.dryRun ? 'Dry run — nothing written. Re-run without --dry-run to apply.' : 'Done.'}\n`);
}

main();
