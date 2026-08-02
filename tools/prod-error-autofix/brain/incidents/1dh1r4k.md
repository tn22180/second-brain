fingerprint: 1dh1r4k
service: dailyjobssynccrisponestarshops
message: [syncCrispOneStarShops] fetch failed for segment 1-star aborting without save
app: BLOG
repo: blogs
date: 2026-08-02T00:36:22.834Z
status: mr_open
attempt: 1

# BLOG · dailyjobssynccrisponestarshops · 1dh1r4k

**Outcome.** duplicate of n9axd7 — MR https://gitlab.com/avada/blogs/-/merge_requests/816

**Root cause.** The Crisp plugin credential hardcoded in packages/functions/src/services/config/crisp.js (identifier 97b91091-366b-4c9f-a9ec-e1419ade1502) is still not subscribed to Crisp website dbb461f3-42ba-4046-bd39-cb50fc8f63f3, so GET /v1/website/{id}/conversations/1 has returned 404 not_subscribed on every daily run since 2026-07-30 — a Crisp-side subscription revocation, not a code regression. Recurrence of fingerprint 1dh1r4k (attempt 1 deferred by mr_per_repo_per_day, no MR merged).

**Mechanism.** initCrisp.js:6 authenticates the shared CrispClient as tier 'plugin' with the static identifier/key from config/crisp.js:5-6. listConversations.js:7 issues GET https://api.crisp.chat/v1/website/dbb461f3-42ba-4046-bd39-cb50fc8f63f3/conversations/1; Crisp answers {"reason":"error","message":"not_subscribed","code":404,"data":{"message":"Got response error: the website is not subscribed to the plugin"}} — logged verbatim at 00:30:44.935218Z. crisp-api rejects, getData.js:16 catches and logs '[getConversations]' then returns undefined. fetchSegmentConversations sees !pageData on page 1 and returns null (syncCrispOneStarShops.js:77-78); the caller hits the deliberate abort branch and logs the alert text verbatim at syncCrispOneStarShops.js:30, then returns without saving (line 31). The alert IS that abort branch, 0.4ms after the Crisp 404 — same instance, same run. Failure is now 4-for-4 on consecutive daily runs (2026-07-30, 07-31, 08-01, 08-02), each with a matched not_subscribed line 0.2-0.4ms earlier, versus 10 consecutive successful runs 2026-07-20 → 2026-07-29 on identical code. Side effect: crispSegments/oneStarShops is frozen at the 2026-07-29 write, and getOneStarShops (crispSegmentRepository.js:22-26) reads it with no syncedAt staleness guard, so the low-rating login alert has served 4-day-old data silently.

Confidence: `high`

## Code
- `packages/functions/src/services/config/crisp.js:5` — hardcoded plugin identifier Crisp now rejects as not subscribed to website_id on line 4 — also violates the repo's no-hardcoded-credentials rule
- `packages/functions/src/services/crisp/initCrisp.js:6` — authenticateTier('plugin', identifier, key) — the credential tier the 404 not_subscribed names
- `packages/functions/src/services/crisp/api/conversations/listConversations.js:7` — the exact request that 404s: /website/{website_id}/conversations/{pageNumber}
- `packages/functions/src/services/crisp/getData.js:16` — catch swallows the Crisp rejection, logs '[getConversations]' (the second alert line) and returns undefined — caller cannot distinguish permanent auth revocation from a transient network error
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:78` — page===1 with undefined pageData returns null, escalating one API error to a full segment failure
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:30` — logger.error line that produced the alert text verbatim, then returns without saving
- `packages/functions/src/repositories/crispSegmentRepository.js:22` — getOneStarShops returns the stale doc with no syncedAt age check, so the frozen 2026-07-29 list is consumed as if fresh

## Evidence
- 4 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-30T00:00:00Z" AND (textPayload:"not_subscribed" OR jsonPayload.message:"not_subscribed")`
- 4 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-30T00:00:00Z" AND (textPayload:"aborting without save" OR jsonPayload.message:"aborting without save")`
- 10 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-20T00:00:00Z" AND timestamp<="2026-07-30T00:00:00Z" AND (textPayload:"synced" OR jsonPayload.message:"synced")`
- 4 matching entries: `resource.labels.project_id="avada-blog-app" AND timestamp>="2026-07-29T00:00:00Z" AND (textPayload:"not_subscribed" OR jsonPayload.message:"not_subscribed")`

## Job
- analyze rounds: 1
- cost: $0.75
- MR: https://gitlab.com/avada/blogs/-/merge_requests/816

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
