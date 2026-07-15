# Bundle Optimization & Entry Point Organization

## Bundle Analysis Tools

### 1. RAM Footprint Analyzer (MOST IMPORTANT)

**Purpose**: Estimate runtime RAM usage before deployment

**Usage**:
```bash
cd packages/functions
yarn production
# Check console for RAM analysis
```

**What it shows**:
- Bundle size (code always loaded at cold start)
- Always-loaded externals (imported at module scope)
- Lazy-loadable externals (behind dynamic imports)
- Base RAM (minimum needed for cold start)
- Max RAM (if all lazy imports execute)

**How to interpret**:
```
🧠 RAM Footprint Analysis
Bundle Size:              4.21 MB

Always-Loaded Externals:
  Total Always-Loaded:        172.34 MB  ← Allocate at least this

Lazy-Loadable Externals:
  Total Lazy:                  842.42 MB  ← Only loads when called

Recommendation: Allocate 512 MB RAM
(2x base + buffer for occasional lazy loads)
```

---

### 2. Bundle Visualizer

**Purpose**: Visual exploration of bundle composition

**Usage**:
```bash
cd packages/functions
yarn production
open lib/bundle-stats.html
```

**Shows**: Interactive treemap of all bundles and their dependencies

---

### 3. Deployment Size Calculator

**Purpose**: See what actually gets deployed to Firebase

**Output**:
```
📦 Deployment Size Analysis
Bundled JavaScript:     35.66 MB  ← Loaded immediately
External node_modules:  964.28 MB ← Deployed but loaded on-demand
Total:                  999.94 MB
```

---

## Entry Point Organization

### Current Entry Points

| Entry Point | Purpose | Bundle Size | Memory | Example Functions |
|-------------|---------|-------------|--------|-------------------|
| **http-webhooks** | High-traffic webhooks | ~2MB | 256-512MB | orders/create, customers/create |
| **http-lightweight** | Simple handlers | ~1MB | 256MB | OAuth, POS tracking |
| **http-admin** | Heavy admin APIs | ~4MB | 4GB | Full CRUD APIs |
| **http-embed** | Embedded app | ~400KB | 256MB | HTML server |
| **http-rest** | REST API | ~3MB | 1-2GB | REST endpoints |
| **http-integrations** | Third-party integrations | ~3MB | 1-2GB | External API sync |
| **pubsub-background** | Background processing | ~3MB | 512MB-4GB | Email, exports, sync |
| **pubsub** | Domain pubsub | ~3MB | varies | Analytics, expiration |
| **schedule** | Scheduled functions | ~3MB | varies | Cron jobs |
| **tasks** | Cloud Tasks | ~2MB | varies | Delayed processing |
| **triggers** | Firestore triggers | ~2MB | varies | onCreate, onUpdate |

### Entry Point Grouping Strategy

**Create separate entry point when:**
1. ✅ Different traffic patterns (high vs low volume)
2. ✅ Different resource needs (light vs heavy RAM)
3. ✅ Can significantly reduce bundle size if separated (>50% reduction)
4. ✅ Unique heavy dependencies (e.g., only one using Puppeteer)

**Share entry point when:**
1. ✅ Shares most dependencies with group
2. ✅ Similar traffic pattern and resource needs
3. ✅ Separation wouldn't reduce bundle size significantly
4. ✅ Low traffic (cold start less critical)

---

## Bundle Size Guidelines

| Function Type | Target Bundle | Why |
|---------------|---------------|-----|
| **Webhooks** | < 1MB | Need fast cold start (5s response limit) |
| **Lightweight** | < 1MB | High traffic, simple operations |
| **Admin** | 4-5MB OK | Infrequent use, complex operations |
| **Background** | 2-4MB OK | Not user-facing, can wait |

---

## Lazy Loading Guidelines

### When to Lazy Load

Lazy load dependency if:
- Dependency > 50MB
- Used in < 20% of function invocations
- Not needed for cold start path
- Not a core Firebase/Google Cloud SDK

### How to Lazy Load (Centralized Pattern)

**✅ GOOD: Centralized in helpers/lazyImports.js**

```javascript
// helpers/lazyImports.js
export async function getPuppeteer() {
  const puppeteer = await import('puppeteer');
  return puppeteer.default;
}

export async function getGoogleapis() {
  const {google} = await import('googleapis');
  return google;
}

// Usage in service:
async function scrapeWebsite(url) {
  const puppeteer = await getPuppeteer();  // Lazy!
  const browser = await puppeteer.launch();
  // ...
}
```

**Why centralized:**
- Single source of truth
- Easy to find all lazy imports
- Analyzable by tooling
- Consistent naming

**❌ BAD: Inline lazy imports**

```javascript
// Hard to find, analyze, maintain
const puppeteer = await import('puppeteer').then(m => m.default);
```

### DO NOT Lazy Load

- Dependencies < 5MB (not worth the complexity)
- Used on every invocation
- Firebase/Google Cloud SDKs (better to externalize)
- Core utilities needed at startup

---

## Optimization Workflow

### Step 1: Baseline Analysis

```bash
cd packages/functions
yarn production > baseline.txt
```

Review:
- RAM footprint for each entry point
- Which dependencies are always-loaded vs lazy
- Bundle sizes and deployment size

### Step 2: Identify Opportunities

**Red flags to look for**:

1. **Large always-loaded dependencies in high-traffic functions**
   ```
   ❌ http-webhooks: puppeteer always-loaded (763 MB)
   ✅ http-webhooks: puppeteer lazy-loaded via getPuppeteer()
   ```

2. **Heavy dependencies in lightweight entry points**
   ```
   ❌ http-lightweight: 850 MB base RAM
   ✅ http-lightweight: 180 MB base RAM
   ```

3. **Lightweight functions in heavy bundles**
   ```
   ❌ embedApp in http-admin: 3.9MB bundle (loads 52 controllers)
   ✅ embedApp in http-embed: 407KB bundle (minimal deps)
   ```

### Step 3: Apply Optimization

**Options**:
1. Lazy load heavy dependency
2. Externalize dependency
3. Move function to separate entry point
4. Remove unused dependency

### Step 4: Verify Improvement

```bash
yarn production > optimized.txt
diff baseline.txt optimized.txt
```

Check:
- ✅ Bundle size reduced?
- ✅ Base RAM reduced?
- ✅ Expected cold start faster?
- ✅ Build still passes?

### Step 5: Monitor in Production

```bash
# Check actual cold start times
firebase functions:log --only functionName | grep "Function execution"

# Monitor memory usage
# Cloud Console → Functions → Select function → Metrics
```

---

## Common Pitfalls

### ❌ Logical Grouping Without Analysis

**Example**: "embedApp is admin infrastructure, so put it in http-admin"

**Result**:
- Bundle: 2.9MB → 3.9MB (33% larger)
- Cold start: 1.5s → 2-3s (33% slower)
- Loads 52 controllers it doesn't use

**Fix**: Run bundle analysis BEFORE moving functions

---

### ❌ Over-Externalizing

**Example**: Marking every dependency as external

**Result**:
- Slower runtime imports
- Confusing errors
- Loss of tree-shaking benefits

**Fix**: Balance bundled (frequent) vs external (heavy/rare)

---

### ❌ Premature Optimization

**Example**: Lazy loading 5KB utility

**Result**: More complexity, negligible gain

**Fix**: Focus on dependencies > 50MB first

---

### ❌ Ignoring Traffic Patterns

**Example**: Putting high-traffic function in 4MB bundle

**Result**: Slow cold starts on every request

**Fix**: High-traffic functions need fast cold starts (< 1MB bundles)

---

## Performance Analysis Checklist

**Before making architectural changes:**

```
☐ Run bundle analysis (yarn production)
☐ Check current bundle sizes
☐ Estimate RAM impact
☐ Consider cold start impact
☐ Document decision rationale
☐ Make the change
☐ Re-run analysis
☐ Verify improvement (or accept tradeoff)
```

---

## Real-World Examples

### Example 1: Embed App Optimization

**Problem**:
- embedApp served simple HTML
- Placed in http-admin entry point
- Loaded 3.9MB bundle with 52 controllers

**Solution**:
- Created separate http-embed.js entry point
- Bundle: 3.9MB → 407KB (90% reduction)
- Memory: 1GB → 256MB (75% reduction)
- Cold start: ~2s → ~500ms (75% faster)

**Lesson**: Analyze what function actually needs, not where it "logically" belongs

---

### Example 2: Puppeteer Lazy Loading

**Problem**:
- puppeteer (763MB) loaded at module scope
- Added to every bundle using it
- Slow cold starts even when not needed

**Solution**:
```javascript
// Before: Always loaded
import puppeteer from 'puppeteer';

// After: Lazy loaded
const puppeteer = await getPuppeteer();
```

**Result**:
- Base RAM: 850MB → 180MB
- Only loads when scraping actually happens

---

## Summary

**Golden Rules**:

1. 📊 **Analyze before changing** - Use bundle analysis tools before architectural changes
2. 🎯 **Target high-impact** - Focus on >50% bundle reductions first
3. ⚡ **Fast cold starts for high-traffic** - Keep webhook/auth bundles < 1MB
4. 🔍 **Monitor actual metrics** - Verify improvements in production

**Tools**:
- RAM Footprint Analyzer (yarn production)
- Bundle Visualizer (lib/bundle-stats.html)
- Deployment Size Calculator (console output)
