# Credit History Report Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a user-level Claude Code skill (`~/.claude/skills/credit-history-report/`) that queries the `shops/{shopId}/creditHistories` Firestore sub-collection and produces daily/weekly/range reports for one shop or aggregated across all shops.

**Architecture:** Thin Node 20 CLI using `firebase-admin` authenticated via the `GOOGLE_APPLICATION_CREDENTIALS` env var. Four small modules behind one CLI entrypoint. Output: markdown table to stdout plus JSON + CSV files in a `reports/` folder. The skill is read-only — no Firestore writes.

**Tech Stack:** Node 20, `firebase-admin`, plain JS (ESM), no testing framework (manual verification against staging per spec).

**Note on TDD:** The spec explicitly decided against automated tests for this skill (manual exploratory runs against staging are the verification path). Tasks below therefore skip red-green-refactor cycles and instead include an explicit manual verification task against real staging data.

**Spec:** `docs/superpowers/specs/2026-04-21-credit-history-report-skill-design.md`

---

## File Structure

All paths are under `~/.claude/skills/credit-history-report/` unless noted.

| File | Responsibility |
|---|---|
| `SKILL.md` | Frontmatter + triggers + usage instructions Claude reads on invocation |
| `README.md` | Human setup guide (service account, env vars, examples) |
| `.gitignore` | Ignore `node_modules/`, `reports/`, `*.log` |
| `scripts/package.json` | Declares ESM, dependencies (`firebase-admin`) |
| `scripts/dateRange.js` | Parse `--date` / `--week` / `--from/--to` → `{start, end}` UTC Dates |
| `scripts/firestore.js` | Init admin SDK from env; `fetchShopRange()` + `fetchAllShopsRange()` |
| `scripts/output.js` | Render markdown tables; write JSON + CSV files |
| `scripts/query.js` | CLI entry: arg parsing + orchestration + exit codes |

---

## Task 1: Scaffold skill directory + package.json + .gitignore + README

**Files:**
- Create: `~/.claude/skills/credit-history-report/.gitignore`
- Create: `~/.claude/skills/credit-history-report/README.md`
- Create: `~/.claude/skills/credit-history-report/scripts/package.json`

- [ ] **Step 1: Create skill root + scripts subdir**

```bash
mkdir -p ~/.claude/skills/credit-history-report/scripts
mkdir -p ~/.claude/skills/credit-history-report/reports
```

- [ ] **Step 2: Create `.gitignore`**

File: `~/.claude/skills/credit-history-report/.gitignore`

```
node_modules/
reports/
*.log
.env
service-account*.json
```

- [ ] **Step 3: Create `scripts/package.json`**

File: `~/.claude/skills/credit-history-report/scripts/package.json`

```json
{
  "name": "credit-history-report",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node query.js"
  },
  "dependencies": {
    "firebase-admin": "^12.7.0"
  }
}
```

- [ ] **Step 4: Create `README.md` with setup + usage**

File: `~/.claude/skills/credit-history-report/README.md`

````markdown
# credit-history-report

Query the `shops/{shopId}/creditHistories` Firestore sub-collection and produce daily/weekly/range reports.

## Setup

1. Get a Firebase service-account JSON for the project (`avada-seo` prod or `avad-seo-staging`).
2. Put it somewhere safe **outside** this folder, e.g. `~/.config/gcloud/avada-seo-sa.json`.
3. Export it:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/avada-seo-sa.json"
   ```

4. Install deps:

   ```bash
   cd ~/.claude/skills/credit-history-report/scripts
   npm install
   ```

## Usage

Single shop:

```bash
node query.js --shop <shopId> --date 2026-02-16
node query.js --shop <shopId> --week 2026-W07
node query.js --shop <shopId> --from 2026-02-10 --to 2026-02-16
```

All shops (aggregate):

```bash
node query.js --all --date 2026-02-16
node query.js --all --week 2026-W07
node query.js --all --from 2026-02-10 --to 2026-02-16 --top 20
```

## Output

- Markdown table in stdout
- `reports/<prefix>-<range>.json`
- `reports/<prefix>-<range>.csv`

Reports contain `shopifyDomain` — do not share externally without review.

## Env overrides

- `GOOGLE_APPLICATION_CREDENTIALS` — **required**, absolute path to SA JSON.
- `FIRESTORE_PROJECT_ID` — optional override (defaults to the SA's `project_id`).

## Troubleshooting

- **"GOOGLE_APPLICATION_CREDENTIALS not set"** — export it (see Setup).
- **"The query requires an index"** — click the URL in the error to create the collection-group index on `creditHistories.date`.
- **Permission denied** — the SA likely belongs to a different project; double-check with `cat $GOOGLE_APPLICATION_CREDENTIALS | jq .project_id`.
````

- [ ] **Step 5: Install dependencies**

```bash
cd ~/.claude/skills/credit-history-report/scripts && npm install
```

Expected: creates `node_modules/` and `package-lock.json`, no errors.

---

## Task 2: Implement `dateRange.js`

**Files:**
- Create: `~/.claude/skills/credit-history-report/scripts/dateRange.js`

Handles three input shapes and returns UTC-midnight start + end-of-day end.

- [ ] **Step 1: Write `dateRange.js`**

File: `~/.claude/skills/credit-history-report/scripts/dateRange.js`

```js
/**
 * Parse args into { start, end, label } where start is UTC midnight and
 * end is UTC 23:59:59.999 of the inclusive last day.
 *
 * Accepted shapes:
 *   { date: 'YYYY-MM-DD' }
 *   { week: 'YYYY-Www' }          // ISO week (Mon–Sun)
 *   { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 */
export function resolveRange({date, week, from, to}) {
  const provided = [date, week, from || to].filter(Boolean).length;
  if (provided !== 1) {
    throw new RangeError(
      'Specify exactly one of --date, --week, or --from/--to'
    );
  }

  if (date) {
    const d = parseYmd(date, '--date');
    return {start: startOfUtcDay(d), end: endOfUtcDay(d), label: date};
  }

  if (week) {
    const {start, end} = isoWeekRange(week);
    return {start, end, label: week};
  }

  if (!from || !to) {
    throw new RangeError('Both --from and --to are required');
  }
  const f = parseYmd(from, '--from');
  const t = parseYmd(to, '--to');
  if (f > t) throw new RangeError('--from must be <= --to');
  return {
    start: startOfUtcDay(f),
    end: endOfUtcDay(t),
    label: `${from}_${to}`
  };
}

function parseYmd(s, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new RangeError(`${field} must be YYYY-MM-DD, got: ${s}`);
  }
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new RangeError(`${field} is not a real date: ${s}`);
  }
  return dt;
}

function startOfUtcDay(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function endOfUtcDay(d) {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

/**
 * ISO 8601 week: weeks start Monday, week 1 is the week containing
 * the first Thursday of the year.
 */
function isoWeekRange(w) {
  const m = /^(\d{4})-W(\d{2})$/.exec(w);
  if (!m) throw new RangeError(`--week must be YYYY-Www, got: ${w}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) {
    throw new RangeError(`--week number out of range: ${w}`);
  }
  // Jan 4 is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const mon = new Date(week1Mon);
  mon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return {start: startOfUtcDay(mon), end: endOfUtcDay(sun)};
}

/** Format a UTC Date as YYYY-MM-DD. */
export function ymd(d) {
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Smoke-check with inline Node**

```bash
cd ~/.claude/skills/credit-history-report/scripts
node -e "import('./dateRange.js').then(m => {
  console.log(m.resolveRange({date: '2026-02-16'}));
  console.log(m.resolveRange({week: '2026-W07'}));
  console.log(m.resolveRange({from: '2026-02-10', to: '2026-02-16'}));
})"
```

Expected: three objects, each with `start` (UTC midnight) and `end` (UTC 23:59:59.999). Week `2026-W07` should be Mon 2026-02-09 → Sun 2026-02-15.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/credit-history-report
git init -q 2>/dev/null || true
git add .gitignore README.md scripts/package.json scripts/package-lock.json scripts/dateRange.js
git commit -m "scaffold: credit-history-report skill + dateRange parser"
```

(If the skill folder is not a git repo the user wants to track, skip `git init` and the commit — this is optional housekeeping.)

---

## Task 3: Implement `firestore.js`

**Files:**
- Create: `~/.claude/skills/credit-history-report/scripts/firestore.js`

Owns admin SDK init, single-shop query, and aggregate query (collection group with per-shop fallback).

- [ ] **Step 1: Write `firestore.js`**

File: `~/.claude/skills/credit-history-report/scripts/firestore.js`

```js
import admin from 'firebase-admin';
import {readFileSync} from 'node:fs';

const RESERVED_FIELDS = new Set(['date', 'totalUsage', 'updatedAt']);

let dbSingleton = null;

export function getFirestore() {
  if (dbSingleton) return dbSingleton;

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!saPath) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is not set. ' +
        'Export the absolute path to your Firebase service-account JSON.'
    );
  }

  const sa = JSON.parse(readFileSync(saPath, 'utf8'));
  const projectId = process.env.FIRESTORE_PROJECT_ID || sa.project_id;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId
    });
  }
  dbSingleton = admin.firestore();
  return dbSingleton;
}

/** Extract action buckets (every numeric field that isn't reserved). */
export function extractActionBuckets(docData) {
  const out = {};
  for (const [k, v] of Object.entries(docData)) {
    if (RESERVED_FIELDS.has(k)) continue;
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

/**
 * Single-shop range query.
 * Returns { shopId, shopifyDomain, days: [{date, totalUsage, byAction}] }.
 */
export async function fetchShopRange(shopId, start, end) {
  const db = getFirestore();
  const shopRef = db.collection('shops').doc(shopId);

  const [shopSnap, historySnap] = await Promise.all([
    shopRef.get(),
    shopRef
      .collection('creditHistories')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .orderBy('date', 'asc')
      .get()
  ]);

  const shopifyDomain = shopSnap.exists
    ? shopSnap.data().shopifyDomain || ''
    : '';

  const days = historySnap.docs.map(doc => {
    const data = doc.data();
    return {
      date: doc.id,
      totalUsage: data.totalUsage || 0,
      byAction: extractActionBuckets(data)
    };
  });

  return {shopId, shopifyDomain, days};
}

/**
 * Aggregate across all shops.
 * Tries collectionGroup('creditHistories') first.
 * If the index is missing, falls back to iterating shop IDs.
 *
 * Returns { shops: [{shopId, shopifyDomain, totalUsage, byAction}],
 *           summary: {shopsWithActivity, totalUsage, byAction} }.
 */
export async function fetchAllShopsRange(start, end) {
  const db = getFirestore();
  const perShop = new Map(); // shopId -> {totalUsage, byAction}

  const ingest = (shopId, data) => {
    const row = perShop.get(shopId) || {totalUsage: 0, byAction: {}};
    row.totalUsage += data.totalUsage || 0;
    for (const [k, v] of Object.entries(extractActionBuckets(data))) {
      row.byAction[k] = (row.byAction[k] || 0) + v;
    }
    perShop.set(shopId, row);
  };

  try {
    const snap = await db
      .collectionGroup('creditHistories')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .get();

    for (const doc of snap.docs) {
      // doc.ref.path = shops/{shopId}/creditHistories/{YYYY-MM-DD}
      const shopId = doc.ref.parent.parent.id;
      ingest(shopId, doc.data());
    }
  } catch (err) {
    if (!/index|INDEX/i.test(err.message || '')) throw err;
    console.warn(
      '[fallback] collectionGroup query failed, iterating shops. ' +
        'Create the index printed above to speed this up.'
    );
    await iterateAllShops(db, start, end, ingest);
  }

  // Batch fetch shopifyDomain for shops that had activity.
  const shopIds = [...perShop.keys()];
  const domains = await batchGetDomains(db, shopIds);

  const shops = shopIds
    .map(id => ({
      shopId: id,
      shopifyDomain: domains.get(id) || '',
      totalUsage: perShop.get(id).totalUsage,
      byAction: perShop.get(id).byAction
    }))
    .sort((a, b) => b.totalUsage - a.totalUsage);

  const summary = {
    shopsWithActivity: shops.length,
    totalUsage: shops.reduce((s, r) => s + r.totalUsage, 0),
    byAction: shops.reduce((acc, r) => {
      for (const [k, v] of Object.entries(r.byAction)) {
        acc[k] = (acc[k] || 0) + v;
      }
      return acc;
    }, {})
  };

  return {shops, summary};
}

async function iterateAllShops(db, start, end, ingest) {
  // listDocuments lists doc refs even without fields; scalable for ~tens of thousands.
  const shopRefs = await db.collection('shops').listDocuments();
  const CONCURRENCY = 10;
  for (let i = 0; i < shopRefs.length; i += CONCURRENCY) {
    const chunk = shopRefs.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async ref => {
        const snap = await ref
          .collection('creditHistories')
          .where('date', '>=', start)
          .where('date', '<=', end)
          .get();
        for (const doc of snap.docs) ingest(ref.id, doc.data());
      })
    );
  }
}

async function batchGetDomains(db, shopIds) {
  const out = new Map();
  if (shopIds.length === 0) return out;
  const CHUNK = 300; // getAll() soft limit
  for (let i = 0; i < shopIds.length; i += CHUNK) {
    const refs = shopIds
      .slice(i, i + CHUNK)
      .map(id => db.collection('shops').doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) {
        out.set(snap.id, snap.data().shopifyDomain || '');
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/skills/credit-history-report
git add scripts/firestore.js && git commit -m "feat: firestore init + single-shop + aggregate queries" 2>/dev/null || true
```

---

## Task 4: Implement `output.js`

**Files:**
- Create: `~/.claude/skills/credit-history-report/scripts/output.js`

- [ ] **Step 1: Write `output.js`**

File: `~/.claude/skills/credit-history-report/scripts/output.js`

```js
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const fmt = n => (typeof n === 'number' ? n.toLocaleString('en-US') : n);

export function renderSingleShopMarkdown({shopId, shopifyDomain, days, range}) {
  const actions = new Set();
  for (const d of days) for (const k of Object.keys(d.byAction)) actions.add(k);
  const actionCols = [...actions].sort();

  const lines = [];
  lines.push(`# Credit History — ${shopId}${shopifyDomain ? ` (${shopifyDomain})` : ''}`);
  lines.push(`Range: ${range.from} → ${range.to}`);
  lines.push('');

  if (days.length === 0) {
    lines.push('_No credit history found in this range._');
    return lines.join('\n');
  }

  const header = ['date', ...actionCols, 'totalUsage'];
  const align = ['---', ...actionCols.map(() => '---:'), '---:'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${align.join(' | ')} |`);

  const totals = Object.fromEntries(actionCols.map(k => [k, 0]));
  let grandTotal = 0;
  for (const d of days) {
    const row = [
      d.date,
      ...actionCols.map(k => fmt(d.byAction[k] || 0)),
      fmt(d.totalUsage)
    ];
    lines.push(`| ${row.join(' | ')} |`);
    for (const k of actionCols) totals[k] += d.byAction[k] || 0;
    grandTotal += d.totalUsage;
  }
  const totalRow = [
    '**Total**',
    ...actionCols.map(k => `**${fmt(totals[k])}**`),
    `**${fmt(grandTotal)}**`
  ];
  lines.push(`| ${totalRow.join(' | ')} |`);
  return lines.join('\n');
}

export function renderAggregateMarkdown({shops, summary, range, top}) {
  const actions = new Set();
  for (const s of shops) for (const k of Object.keys(s.byAction)) actions.add(k);
  const actionCols = [...actions].sort();

  const lines = [];
  lines.push(`# Credit History — All Shops`);
  lines.push(`Range: ${range.from} → ${range.to}`);
  lines.push('');
  lines.push(`- Shops with activity: ${fmt(summary.shopsWithActivity)}`);
  lines.push(`- Total usage: ${fmt(summary.totalUsage)}`);
  for (const k of actionCols) {
    lines.push(`- ${k}: ${fmt(summary.byAction[k] || 0)}`);
  }
  lines.push('');

  if (shops.length === 0) {
    lines.push('_No credit history found in this range._');
    return lines.join('\n');
  }

  lines.push(`## Top ${Math.min(top, shops.length)} shops`);
  const header = ['shopId', 'shopifyDomain', 'totalUsage', ...actionCols];
  const align = ['---', '---', '---:', ...actionCols.map(() => '---:')];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${align.join(' | ')} |`);
  for (const s of shops.slice(0, top)) {
    const row = [
      s.shopId,
      s.shopifyDomain || '',
      fmt(s.totalUsage),
      ...actionCols.map(k => fmt(s.byAction[k] || 0))
    ];
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

export function writeReports({outDir, prefix, range, payload}) {
  mkdirSync(outDir, {recursive: true});
  const base = `${prefix}-${range.label}`;
  const jsonPath = join(outDir, `${base}.json`);
  const csvPath = join(outDir, `${base}.csv`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(csvPath, toCsv(payload));
  return {jsonPath, csvPath};
}

function toCsv(payload) {
  if (payload.mode === 'single-shop') {
    const actions = new Set();
    for (const d of payload.days) for (const k of Object.keys(d.byAction)) actions.add(k);
    const cols = [...actions].sort();
    const header = ['date', ...cols, 'totalUsage'];
    const rows = payload.days.map(d => [
      d.date,
      ...cols.map(k => d.byAction[k] || 0),
      d.totalUsage
    ]);
    return csvLines([header, ...rows]);
  }
  // aggregate
  const actions = new Set();
  for (const s of payload.shops) for (const k of Object.keys(s.byAction)) actions.add(k);
  const cols = [...actions].sort();
  const header = ['shopId', 'shopifyDomain', 'totalUsage', ...cols];
  const rows = payload.shops.map(s => [
    s.shopId,
    s.shopifyDomain || '',
    s.totalUsage,
    ...cols.map(k => s.byAction[k] || 0)
  ]);
  return csvLines([header, ...rows]);
}

function csvLines(rows) {
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/skills/credit-history-report
git add scripts/output.js && git commit -m "feat: markdown + JSON + CSV output" 2>/dev/null || true
```

---

## Task 5: Implement `query.js` CLI entry

**Files:**
- Create: `~/.claude/skills/credit-history-report/scripts/query.js`

- [ ] **Step 1: Write `query.js`**

File: `~/.claude/skills/credit-history-report/scripts/query.js`

```js
#!/usr/bin/env node
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

import {resolveRange, ymd} from './dateRange.js';
import {fetchShopRange, fetchAllShopsRange} from './firestore.js';
import {
  renderSingleShopMarkdown,
  renderAggregateMarkdown,
  writeReports
} from './output.js';

const USAGE = `Usage:
  node query.js --shop <shopId> (--date YYYY-MM-DD | --week YYYY-Www | --from YYYY-MM-DD --to YYYY-MM-DD)
  node query.js --all             (--date YYYY-MM-DD | --week YYYY-Www | --from YYYY-MM-DD --to YYYY-MM-DD) [--top N]

Options:
  --top N            Aggregate: top-N shops in the markdown table (default 10).
  --out <dir>        Override output dir (default: <skill>/reports/).
  --project <id>     Override Firestore project ID (else taken from SA).

Env:
  GOOGLE_APPLICATION_CREDENTIALS  required, absolute path to SA JSON
  FIRESTORE_PROJECT_ID            optional, overrides SA project_id
`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--shop') out.shop = argv[++i];
    else if (a === '--date') out.date = argv[++i];
    else if (a === '--week') out.week = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--top') out.top = parseInt(argv[++i], 10);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--project') out.project = argv[++i];
    else if (a === '-h' || a === '--help') out.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (args.project) process.env.FIRESTORE_PROJECT_ID = args.project;

  const modeCount = (args.shop ? 1 : 0) + (args.all ? 1 : 0);
  if (modeCount !== 1) {
    console.error('Specify exactly one of --shop <id> or --all\n');
    console.error(USAGE);
    process.exit(2);
  }

  let range;
  try {
    range = resolveRange(args);
  } catch (e) {
    console.error(e.message + '\n');
    console.error(USAGE);
    process.exit(2);
  }

  const rangeOut = {from: ymd(range.start), to: ymd(range.end), label: range.label};
  const __filename = fileURLToPath(import.meta.url);
  const scriptDir = dirname(__filename);
  const defaultOutDir = resolve(scriptDir, '..', 'reports');
  const outDir = args.out ? resolve(args.out) : defaultOutDir;

  if (args.shop) {
    const result = await fetchShopRange(args.shop, range.start, range.end);
    const totalUsage = result.days.reduce((s, d) => s + d.totalUsage, 0);
    const byAction = result.days.reduce((acc, d) => {
      for (const [k, v] of Object.entries(d.byAction)) acc[k] = (acc[k] || 0) + v;
      return acc;
    }, {});
    const payload = {
      mode: 'single-shop',
      shopId: result.shopId,
      shopifyDomain: result.shopifyDomain,
      range: rangeOut,
      total: {totalUsage, byAction},
      days: result.days
    };
    console.log(
      renderSingleShopMarkdown({...result, range: rangeOut})
    );
    const {jsonPath, csvPath} = writeReports({
      outDir,
      prefix: `shop-${args.shop}`,
      range: rangeOut,
      payload
    });
    console.log(`\nSaved: ${jsonPath}`);
    console.log(`Saved: ${csvPath}`);
    return;
  }

  // aggregate
  const top = Number.isFinite(args.top) && args.top > 0 ? args.top : 10;
  const {shops, summary} = await fetchAllShopsRange(range.start, range.end);
  const payload = {
    mode: 'aggregate',
    range: rangeOut,
    summary,
    shops
  };
  console.log(renderAggregateMarkdown({shops, summary, range: rangeOut, top}));
  const {jsonPath, csvPath} = writeReports({
    outDir,
    prefix: 'all-shops',
    range: rangeOut,
    payload
  });
  console.log(`\nSaved: ${jsonPath}`);
  console.log(`Saved: ${csvPath}`);
}

main().catch(err => {
  console.error(err.message || err);
  if (err.stack && process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-check help + arg validation (no Firestore call)**

```bash
cd ~/.claude/skills/credit-history-report/scripts
node query.js --help
node query.js                              # expect usage error, exit 2
node query.js --shop abc --all --date 2026-02-16   # expect "exactly one" error
node query.js --shop abc --date 2026/02/16         # expect "YYYY-MM-DD" error
```

Expected: first prints USAGE and exits 0; rest print a helpful error and exit 2.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/credit-history-report
git add scripts/query.js && git commit -m "feat: CLI entry" 2>/dev/null || true
```

---

## Task 6: Manual verification against staging

This is the only real test of the skill. Do not skip.

**Prereqs:**
- User has a staging SA JSON at a known path (ask if not provided).
- `GOOGLE_APPLICATION_CREDENTIALS` exported to that path.

- [ ] **Step 1: Identify a test shop with known credit history**

Use Firebase console (or an existing query) on `avad-seo-staging` to find a `shopId` that has at least one `creditHistories/*` doc recently. Write the shopId and one date down.

- [ ] **Step 2: Run single-shop single-day**

```bash
cd ~/.claude/skills/credit-history-report/scripts
node query.js --shop <TEST_SHOP_ID> --date <KNOWN_DATE>
```

Expected: a markdown table with one row matching the Firestore console values for that day. JSON + CSV written under `reports/`.

- [ ] **Step 3: Run single-shop multi-day range**

```bash
node query.js --shop <TEST_SHOP_ID> --from <D1> --to <D2>
```

Expected: rows ordered ascending by date; `**Total**` row equals sum of per-day `totalUsage`.

- [ ] **Step 4: Run ISO week**

```bash
node query.js --shop <TEST_SHOP_ID> --week 2026-W07
```

Expected: range printed in the header spans 2026-02-09 → 2026-02-15.

- [ ] **Step 5: Run aggregate**

```bash
node query.js --all --date <RECENT_DATE> --top 5
```

Expected: summary line with `shopsWithActivity` > 0 (on staging, probably small), top-5 table. If you hit a missing-index error, click the URL in the error, create the index, wait a minute, rerun.

- [ ] **Step 6: Verify a no-data case**

```bash
node query.js --shop <TEST_SHOP_ID> --date 2020-01-01
```

Expected: "_No credit history found in this range._" in stdout, JSON still written with `days: []`.

- [ ] **Step 7: Verify missing env-var case**

```bash
env -u GOOGLE_APPLICATION_CREDENTIALS node query.js --shop x --date 2026-02-16
```

Expected: exit 1 with message pointing at the missing env var.

- [ ] **Step 8: Note any deviations**

If any of the above doesn't match expectations, stop and fix before Task 7.

---

## Task 7: Write `SKILL.md`

**Files:**
- Create: `~/.claude/skills/credit-history-report/SKILL.md`

This is what Claude reads when the user asks for a credit-history report — it must include enough context to invoke the CLI correctly without re-discovering anything.

- [ ] **Step 1: Write `SKILL.md`**

File: `~/.claude/skills/credit-history-report/SKILL.md`

````markdown
---
name: credit-history-report
description: Use when the user asks for a credit usage / credit history report, daily/weekly/monthly AI credit totals, per-shop credit breakdown, or top shops by credit usage. Reads Firestore sub-collection `shops/{shopId}/creditHistories` via a user-provided service account. Supports single-shop and aggregate modes.
---

# Credit History Report

Generates credit usage reports from `shops/{shopId}/creditHistories` in Firestore.
Two modes: **single-shop** (drill-down for one shop) and **aggregate** (all shops in the project).

## Preconditions

Before running anything, check that `GOOGLE_APPLICATION_CREDENTIALS` is exported:

```bash
echo "$GOOGLE_APPLICATION_CREDENTIALS"
```

If empty, ask the user for the absolute path to their Firebase service-account JSON and have them export it. Do not hardcode or write it into files.

On first use in a fresh checkout, install deps:

```bash
cd ~/.claude/skills/credit-history-report/scripts && npm install
```

## How to invoke

Pick a mode and a range. All dates are UTC.

### Single shop

```bash
cd ~/.claude/skills/credit-history-report/scripts
node query.js --shop <shopId> --date YYYY-MM-DD
node query.js --shop <shopId> --week YYYY-Www
node query.js --shop <shopId> --from YYYY-MM-DD --to YYYY-MM-DD
```

### Aggregate (all shops)

```bash
cd ~/.claude/skills/credit-history-report/scripts
node query.js --all --date YYYY-MM-DD
node query.js --all --week YYYY-Www
node query.js --all --from YYYY-MM-DD --to YYYY-MM-DD [--top 20]
```

## Output

- Markdown table printed to stdout — paste directly into Slack / doc.
- JSON + CSV written under `~/.claude/skills/credit-history-report/reports/`.
- File naming: `shop-<id>-<range>.json` or `all-shops-<range>.json`.

## Interpreting fields

- `totalUsage` — sum of all action increments that day.
- Every other numeric field (e.g. `generateFaqsInBulk`) is an action bucket added automatically when a feature starts logging credits. The skill discovers them dynamically — no code change needed when a new feature is added.
- `shopifyDomain` is read from the parent `shops/{shopId}` doc; empty if missing.

## Troubleshooting

- **Missing index error in aggregate mode:** click the URL from the error to create a collection-group index on `creditHistories.date` ascending. Takes ~1 min on small projects.
- **Permission denied:** SA belongs to a different project. `cat $GOOGLE_APPLICATION_CREDENTIALS | jq .project_id` to verify.
- **Empty results:** remember dates are UTC — a shop in Vietnam timezone running at 07:00 local on 2026-02-17 logs against UTC `2026-02-17`, not `2026-02-16`.

## Never

- Do not commit the service-account JSON or the `reports/` folder (both in `.gitignore`).
- Do not write to Firestore from this skill — read-only.
- Do not forward `reports/*.csv` externally without review — contains `shopifyDomain`.
````

- [ ] **Step 2: Verify the skill is discoverable**

```bash
ls ~/.claude/skills/credit-history-report/
```

Expected: `SKILL.md`, `README.md`, `.gitignore`, `scripts/`, `reports/` all present.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills/credit-history-report
git add SKILL.md && git commit -m "feat: SKILL.md with invocation instructions" 2>/dev/null || true
```

---

## Done criteria

- All six files under `scripts/` exist and `node query.js --help` prints usage.
- Manual verification (Task 6) passed on staging.
- `SKILL.md` present at skill root so Claude can discover and invoke the skill.
