---
name: seo-gsc-v2-shipped
description: GSC v2 is now the only Google Search Console page in seo (MR !2081 merged to master 2026-09-07); AI insights charge 5 credits under action gscInsights and cache in Firestore collection googleInsights whose TTL policy still needs enabling before the prod tag.
metadata:
  type: project
---

Merged to `master` 2026-09-07 via !2081 (+ follow-ups !2221, !2226): `pages/GoogleSearchConsole` replaces the legacy `pages/Google`, `GoogleReport`, `GoogleSitemap`; route `/indexing/google-search-console` in every env, no `isStaging` gate. Not deployed until a tag is cut ([[seo-prod-deploy-by-tag]]).

Open items at merge time:
- `googleInsights` Firestore TTL policy (2 days, `const/ttlPolicies.js`) not yet enabled in GCP — run `node packages/functions/scripts/enable-ttl.js --project=<id>` once per project (avada-seo + the staging in use). Without it docs linger; freshness still enforced by `generatedAt`.
- AI insights: `INSIGHT_CREDIT_COST = 5`, action `gscInsights` in `AI_CREDIT_USAGE_ACTION` → shows in credit reports as a new feature key ([[credit-not-tokens]]).
- Legacy page had an `isLimitOld → showUpgradeModal()` gate on report/sitemap; new page has none. Product decision pending with Tuan.

**Why:** "merged" ≠ live here, and the TTL step is project state nobody will see in the diff.
**How to apply:** if GSC/insights questions come up, check `git tag --contains` for the merge first, then whether the TTL policy exists (`gcloud firestore fields ttls list --project=avada-seo`).
