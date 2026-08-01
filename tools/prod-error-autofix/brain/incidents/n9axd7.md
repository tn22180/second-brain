fingerprint: n9axd7
service: dailyjobssynccrisponestarshops
message: [getConversations] {"reason":"error","message":"not_subscribed","code":404,"data":{"namespace":"response","message":"Got response error: the website is not subscribed to the plugin"}}
app: BLOG
repo: blogs
date: 2026-08-01T00:35:09.472Z
status: deferred
attempt: 1

# BLOG · dailyjobssynccrisponestarshops · n9axd7

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Duplicate of fingerprint 1dh1r4k (same execution_id 9mxq70po4598, deferred by mr_per_repo_per_day): the hardcoded Crisp plugin credential in packages/functions/src/services/config/crisp.js (identifier 97b91091-366b-4c9f-a9ec-e1419ade1502) is no longer subscribed to Crisp website dbb461f3-42ba-4046-bd39-cb50fc8f63f3, so every GET /v1/website/{id}/conversations/1 has answered 404 not_subscribed on all three daily runs since 2026-07-30 — an external Crisp-side revocation, not a code regression.

**Mechanism.** initCrisp.js:6 authenticates the shared CrispClient as tier 'plugin' with the static identifier/key from config/crisp.js:5. listConversations.js:7 issues GET https://api.crisp.chat/v1/website/dbb461f3-42ba-4046-bd39-cb50fc8f63f3/conversations/1 with search_type=segment, search_query=1-star. Crisp rejects with {reason:'error',message:'not_subscribed',code:404,data:{message:'Got response error: the website is not subscribed to the plugin'}}. getData.js:16 catches the rejection, logs '[getConversations]' — the exact alert text — and returns undefined. fetchSegmentConversations sees !pageData with page===1 and returns null (syncCrispOneStarShops.js:77-78); the caller logs '[syncCrispOneStarShops] fetch failed for segment 1-star aborting without save' and returns before saveOneStarShops (syncCrispOneStarShops.js:30-31). Both alert lines share spanId 15222424176734371817 and execution_id 9mxq70po4598 — one execution, one cause, two symptoms. Side effect: crispSegments/oneStarShops is frozen at the 2026-07-29 write and getOneStarShops has no syncedAt age check (crispSegmentRepository.js:22-26), so the low-rating login alert has served 3-day-stale data since.

Confidence: `high`

## Code
- `packages/functions/src/services/config/crisp.js:5` — hardcoded plugin identifier Crisp now rejects as not subscribed to the website_id on line 4
- `packages/functions/src/services/crisp/initCrisp.js:6` — authenticateTier('plugin', identifier, key) — the credential tier the 404 not_subscribed names
- `packages/functions/src/services/crisp/api/conversations/listConversations.js:7` — the exact request that 404s: /website/{website_id}/conversations/{page}
- `packages/functions/src/services/crisp/getData.js:16` — catch swallows the Crisp rejection, emits the alert line verbatim and returns undefined — caller cannot distinguish permanent auth revocation from a transient error
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:78` — page===1 with undefined pageData returns null, promoting the auth failure to a full-segment failure
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:30` — the second alert line, then return without save — deliberate abort branch
- `packages/functions/src/repositories/crispSegmentRepository.js:22` — getOneStarShops has no syncedAt staleness check, so the frozen 2026-07-29 list is consumed as fresh

## Evidence
- 3 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-30T00:00:00Z" AND (textPayload:"not_subscribed" OR jsonPayload.message:"not_subscribed")`
- 3 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-30T00:00:00Z" AND (textPayload:"aborting without save" OR jsonPayload.message:"aborting without save")`
- 10 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-20T00:00:00Z" AND timestamp<="2026-07-30T00:00:00Z" AND (textPayload:"synced" OR jsonPayload.message:"synced")`
- 2 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops" OR resource.labels.function_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-08-01T00:15:52.142Z" AND timestamp<="2026-08-01T00:45:52.142Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $0.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
