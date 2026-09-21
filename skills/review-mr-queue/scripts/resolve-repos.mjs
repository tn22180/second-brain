#!/usr/bin/env node
// resolve-repos.mjs — map projectPath GitLab (vd "avada/seo") → repo clone local trên máy Tech Lead.
// KHÔNG bảng cứng: đọc cache repos.local.json (ưu tiên) + tự quét vài thư mục gốc phổ biến.
// READ-ONLY với repo (chỉ đọc .git/config); chỉ ghi file cache repos.local.json.
//
// Dùng:
//   node resolve-repos.mjs                     → JSON { cachePath, cached[], scanned[] } (toàn cảnh để onboard)
//   node resolve-repos.mjs --path <projectPath> → JSON { projectPath, localPath|null, source }
//   node resolve-repos.mjs --save <projectPath> <localPath> → ghi cache, in { saved, cachePath }
//   node resolve-repos.mjs --forget <projectPath>           → xoá 1 entry khỏi cache
//
// Thư mục quét (depth ≤2, tìm repo có remote origin gitlab.com khớp projectPath):
//   env REVIEW_PROJECTS_ROOT (nhiều đường ngăn bằng ":") + cwd + các gốc mặc định phổ biến.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.join(__dirname, '..');
const CACHE = path.join(SKILL_ROOT, 'repos.local.json');
const HOME = os.homedir();

const DEFAULT_ROOTS = [
  process.cwd(),
  path.join(HOME, 'Desktop', 'Workspace'),
  path.join(HOME, 'Desktop', 'Workspace', 'ai-workspace', 'projects'),
  path.join(HOME, 'projects'),
  path.join(HOME, 'Projects'),
  path.join(HOME, 'code'),
  path.join(HOME, 'Code'),
  path.join(HOME, 'work'),
  path.join(HOME, 'src'),
  path.join(HOME, 'Documents'),
];

function roots() {
  const envRoots = (process.env.REVIEW_PROJECTS_ROOT || '')
    .split(':').map((s) => s.trim()).filter(Boolean);
  return [...new Set([...envRoots, ...DEFAULT_ROOTS])].filter((p) => {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
  });
}

// projectPath chuẩn hoá từ remote origin: bỏ protocol/host/.git, giữ phần namespace/repo, lowercase.
function normPath(remote) {
  if (!remote) return null;
  let s = remote.trim()
    .replace(/^git@[^:]+:/, '')            // git@gitlab.com:avada/seo.git
    .replace(/^[a-z]+:\/\/[^/]+\//, '')    // https://gitlab.com/avada/seo.git
    .replace(/\.git$/, '');
  return s.toLowerCase();
}

// Đọc remote origin trực tiếp từ .git/config (nhanh hơn spawn git). Trả null nếu không phải repo.
function readOrigin(dir) {
  const cfg = path.join(dir, '.git', 'config');
  let raw;
  try { raw = fs.readFileSync(cfg, 'utf8'); } catch { return null; }
  // tìm block [remote "origin"] ... url = ...
  const m = raw.match(/\[remote "origin"\][^[]*?url\s*=\s*(.+)/s);
  if (!m) return null;
  return m[1].split('\n')[0].trim();
}

// Quét: mỗi root, duyệt con trực tiếp (depth1) + cháu (depth2) tìm repo git.
function scan() {
  const found = [];
  const seen = new Set();
  for (const root of roots()) {
    let lvl1;
    try { lvl1 = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const d1 of lvl1) {
      if (!d1.isDirectory() || d1.name.startsWith('.')) continue;
      const p1 = path.join(root, d1.name);
      const o1 = readOrigin(p1);
      if (o1) { pushHit(found, seen, p1, o1); continue; }
      // depth2 (layout nhóm: <root>/<group>/<repo>)
      let lvl2;
      try { lvl2 = fs.readdirSync(p1, { withFileTypes: true }); } catch { continue; }
      for (const d2 of lvl2) {
        if (!d2.isDirectory() || d2.name.startsWith('.')) continue;
        const p2 = path.join(p1, d2.name);
        const o2 = readOrigin(p2);
        if (o2) pushHit(found, seen, p2, o2);
      }
    }
  }
  return found;
}

function pushHit(found, seen, localPath, remote) {
  const projectPath = normPath(remote);
  if (!projectPath || !/gitlab\.com/i.test(remote)) return;
  if (seen.has(localPath)) return;
  seen.add(localPath);
  found.push({ projectPath, localPath, remote });
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}
function saveCache(obj) {
  fs.writeFileSync(CACHE, JSON.stringify(obj, null, 2) + '\n');
}

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

if (args.includes('--save')) {
  const i = args.indexOf('--save');
  const pp = (args[i + 1] || '').toLowerCase();
  const lp = args[i + 2];
  if (!pp || !lp) { console.error('USAGE: --save <projectPath> <localPath>'); process.exit(1); }
  if (!readOrigin(lp)) { console.error(`NOT_A_GIT_REPO: ${lp}`); process.exit(1); }
  const c = loadCache(); c[pp] = lp; saveCache(c);
  console.log(JSON.stringify({ saved: { [pp]: lp }, cachePath: CACHE }));
  process.exit(0);
}

if (args.includes('--forget')) {
  const pp = (flag('--forget') || '').toLowerCase();
  const c = loadCache(); delete c[pp]; saveCache(c);
  console.log(JSON.stringify({ forgot: pp, cachePath: CACHE }));
  process.exit(0);
}

if (args.includes('--path')) {
  const pp = (flag('--path') || '').toLowerCase();
  const c = loadCache();
  if (c[pp] && readOrigin(c[pp])) {
    console.log(JSON.stringify({ projectPath: pp, localPath: c[pp], source: 'cache' }));
    process.exit(0);
  }
  const hit = scan().find((h) => h.projectPath === pp);
  console.log(JSON.stringify(
    hit ? { projectPath: pp, localPath: hit.localPath, source: 'scan' }
        : { projectPath: pp, localPath: null, source: 'not_found' }
  ));
  process.exit(0);
}

// Mặc định: toàn cảnh cho onboarding — cache hiện có + kết quả quét (merge, ưu tiên cache).
const cache = loadCache();
const scanned = scan();
console.log(JSON.stringify({
  cachePath: CACHE,
  cached: Object.entries(cache).map(([projectPath, localPath]) => ({ projectPath, localPath })),
  scanned,
}, null, 2));
