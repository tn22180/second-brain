fingerprint: 1dh1r4k
service: dailyjobssynccrisponestarshops
message: [syncCrispOneStarShops] fetch failed for segment 1-star aborting without save
app: BLOG
repo: blogs
date: 2026-08-01T00:33:35.756Z
status: deferred
attempt: 1

# BLOG · dailyjobssynccrisponestarshops · 1dh1r4k

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** The Crisp plugin credential pair hardcoded in packages/functions/src/services/config/crisp.js (identifier 97b91091-366b-4c9f-a9ec-e1419ade1502) is no longer subscribed to Crisp website dbb461f3-42ba-4046-bd39-cb50fc8f63f3, so every GET /v1/website/{id}/conversations/1 has returned 404 not_subscribed since 2026-07-30 — an external Crisp-side subscription revocation, not a code regression.

**Mechanism.** initCrisp.js:6 authenticates the shared CrispClient as tier 'plugin' with the static identifier/key from config/crisp.js. listConversations.js:7 issues GET https://api.crisp.chat/v1/website/dbb461f3-42ba-4046-bd39-cb50fc8f63f3/conversations/1; Crisp now answers {reason:'error',message:'not_subscribed',code:404,'the website is not subscribed to the plugin'}. crisp-api rejects, getData.js:16 catches it, logs '[getConversations]' and returns undefined. fetchSegmentConversations sees !pageData on page 1 and returns null (syncCrispOneStarShops.js:78); the caller logs '[syncCrispOneStarShops] fetch failed for segment 1-star aborting without save' and returns (syncCrispOneStarShops.js:30-31). The alert message IS that deliberate abort branch. Neither the config file nor any file under services/crisp has changed in git since the feature merged 2026-07-21 (2d162f6dd), and the identical code succeeded on 10 consecutive daily runs 2026-07-20 → 2026-07-29, so the changed variable is the plugin's subscription on Crisp's side, not the code. Side effect: crispSegments/oneStarShops in Firestore is frozen at the 2026-07-29 write (5 shops), and getOneStarShops() has no staleness guard (crispSegmentRepository.js:23), so the low-rating login alert has been silently serving 3-day-old data.

Confidence: `high`

## Code
- `packages/functions/src/services/config/crisp.js:5` — hardcoded plugin identifier that Crisp now rejects as not subscribed to website_id on line 4
- `packages/functions/src/services/crisp/initCrisp.js:6` — authenticateTier('plugin', identifier, key) — the credential tier the 404 not_subscribed refers to
- `packages/functions/src/services/crisp/api/conversations/listConversations.js:7` — the exact request that 404s: /website/{website_id}/conversations/{page}
- `packages/functions/src/services/crisp/getData.js:16` — catch swallows the Crisp rejection, logs '[getConversations]' (the second alert line) and returns undefined — caller cannot tell permanent auth revocation from a transient network error
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:78` — page===1 with undefined pageData returns null, turning the segment into a full failure
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:30` — logger.error line that produced the alert text verbatim, then returns without saving
- `packages/functions/src/repositories/crispSegmentRepository.js:23` — getOneStarShops returns the stale doc with no syncedAt age check, so the frozen list is consumed as if fresh

## Evidence
- 3 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-30T00:00:00Z" AND (textPayload:"not_subscribed" OR jsonPayload.message:"not_subscribed")`
- 3 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-30T00:00:00Z" AND (textPayload:"aborting without save" OR jsonPayload.message:"aborting without save")`
- 10 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-20T00:00:00Z" AND timestamp<="2026-07-30T00:00:00Z" AND (textPayload:"synced" OR jsonPayload.message:"synced")`
- 3 matching entries: `resource.labels.project_id="avada-blog-app" AND timestamp>="2026-07-29T00:00:00Z" AND (textPayload:"not_subscribed" OR jsonPayload.message:"not_subscribed")`

## Job
- analyze rounds: 1
- cost: $1.03

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
