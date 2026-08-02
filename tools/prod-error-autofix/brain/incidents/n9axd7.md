fingerprint: n9axd7
service: dailyjobssynccrisponestarshops
message: [getConversations] {"reason":"error","message":"not_subscribed","code":404,"data":{"namespace":"response","message":"Got response error: the website is not subscribed to the plugin"}}
app: BLOG
repo: blogs
date: 2026-08-02T00:35:01.948Z
status: mr_open
attempt: 1

# BLOG · dailyjobssynccrisponestarshops · n9axd7

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/816

**Root cause.** The hardcoded Crisp plugin credential in packages/functions/src/services/config/crisp.js (identifier 97b91091-366b-4c9f-a9ec-e1419ade1502) has been unsubscribed from Crisp website dbb461f3-42ba-4046-bd39-cb50fc8f63f3 since 2026-07-30, so every daily GET /v1/website/{id}/conversations/1 answers 404 not_subscribed and the sync aborts before saving — an external Crisp-side revocation, not a code regression. Fourth consecutive failure; same fingerprint as 1dh1r4k / n9axd7 attempt 1.

**Mechanism.** initCrisp.js:6 authenticates the shared CrispClient as tier 'plugin' with the static identifier/key from config/crisp.js:5-6. listConversations.js:7 issues GET https://api.crisp.chat/v1/website/dbb461f3-42ba-4046-bd39-cb50fc8f63f3/conversations/1 with search_type=segment, search_query='1-star'. Crisp rejects with {reason:'error',message:'not_subscribed',code:404,data:{message:'Got response error: the website is not subscribed to the plugin'}}. getData.js:16 catches, logs '[getConversations]' — the exact alert text — and returns undefined. fetchSegmentConversations sees !pageData with page===1 and returns null (syncCrispOneStarShops.js:77-78); the caller logs '[syncCrispOneStarShops] fetch failed for segment 1-star aborting without save' and returns before saveOneStarShops (syncCrispOneStarShops.js:30-31). Both alert lines share spanId 13108626809198873724 and execution_id b2dr53m22sxv — one execution, one cause, two symptoms. Side effect: crispSegments/oneStarShops is frozen at the 2026-07-29 write and getOneStarShops has no syncedAt age check (crispSegmentRepository.js:22-26), so the low-rating login alert has served 4-day-stale data.

Confidence: `high`

## Code
- `packages/functions/src/services/config/crisp.js:5` — hardcoded plugin identifier Crisp now rejects as not subscribed to the website_id on line 4
- `packages/functions/src/services/crisp/initCrisp.js:6` — authenticateTier('plugin', identifier, key) — the credential tier the 404 not_subscribed names
- `packages/functions/src/services/crisp/api/conversations/listConversations.js:7` — the exact request that 404s: /website/{website_id}/conversations/{pageNumber}
- `packages/functions/src/services/crisp/getData.js:16` — catch swallows the Crisp rejection, emits the alert line verbatim and returns undefined — caller cannot distinguish permanent auth revocation from a transient error
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:78` — page===1 with undefined pageData returns null, promoting the auth failure to a full-segment failure
- `packages/functions/src/handlers/cron/syncCrispOneStarShops.js:30` — the second alert line, then return without save — deliberate abort branch
- `packages/functions/src/repositories/crispSegmentRepository.js:22` — getOneStarShops has no syncedAt staleness check, so the frozen 2026-07-29 list is consumed as fresh

## Evidence
- 4 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-25T00:00:00Z" AND (textPayload:"not_subscribed" OR jsonPayload.message:"not_subscribed")`
- 10 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-07-20T00:00:00Z" AND (textPayload:"synced" OR jsonPayload.message:"synced")`
- 2 matching entries: `(resource.labels.service_name="dailyjobssynccrisponestarshops") AND timestamp>="2026-08-02T00:15:46.476Z" AND timestamp<="2026-08-02T00:45:46.476Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.87
- branch: `fix/prod-blog-n9axd7`
- fix commit: `7fc2705d174f961ed1136bd27f0cc289a660e8da`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/816
- tests: 256 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/repositories/crispSegmentRepository.js | 10 +++++++++-
 1 file changed, 9 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
