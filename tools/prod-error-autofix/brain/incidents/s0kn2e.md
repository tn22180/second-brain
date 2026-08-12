fingerprint: s0kn2e
service: api
message: [getVisionCompletion] Error: 400 Received 404 status code when fetching image from URL: <https://cdn.shopify.com/s/files/1/0968/2069/1326/files/13121120107156949389_2048.jpg>
app: BLOG
repo: blogs
date: 2026-08-12T08:05:05.416Z
status: mr_open
attempt: 1

# BLOG · api · s0kn2e

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/860

**Root cause.** The alert is a swallowed, non-fatal per-image failure: OpenRouter's image fetcher got HTTP 404 for two cdn.shopify.com URLs taken verbatim from the merchant's article body, getVisionCompletion caught the resulting 400, logged it at logger.error (severity ERROR, so the sink alerted) and returned null — the fix-issue request itself completed 200.

**Mechanism.** generateImageAltText scrapes <img src> out of the article body with a regex and passes the captured string unchanged to getVisionCompletion (chains.js:463 → 488), so the app builds no URL of its own. OpenRouter fetched https://cdn.shopify.com/s/files/1/0968/2069/1326/files/13121120107156949389_2048.jpg and .../1778535361750.png, got 404 from the CDN, and answered 400 'Received 404 status code when fetching image from URL'. getVisionCompletion's catch logs the whole APIError at logger.error (openAi.service.js:229) and returns null (:230); chains.js:493 gates the rewrite on `if (altText)`, so the image is skipped with no alt text and no throw; auditAgentController.js:144 then sets ctx.status = 200. Both log lines carry the same execution_id gg9n826ms9lj and spanId, and the only fix-issue request they can belong to is the one starting 18:58:18.189Z with latency 1.126s — status 200. The window's requests read (httpRequest.status>=500) is empty, so no 5xx exists. Why the two CDN objects 404 is upstream/merchant-side (deleted or replaced files) and cannot be established from these logs; what is established is that a merchant-content condition is being reported at ERROR severity on a code path that handles it.

Confidence: `medium`

## Code
- `packages/functions/src/services/openAi.service.js:229` — logger.error on every vision failure, including an upstream image-fetch 404 — this is the exact line that produced the alert, at severity ERROR
- `packages/functions/src/services/openAi.service.js:230` — returns null, so the failure never propagates — proves the alert is non-fatal
- `packages/functions/src/services/auditAgent/chains.js:463` — src is captured verbatim from the article body HTML; the app synthesizes no URL, ruling out an app-side URL-building defect
- `packages/functions/src/services/auditAgent/chains.js:488` — call site named in the stack (lib/services/auditAgent/chains.js:461 in the deployed bundle)
- `packages/functions/src/services/auditAgent/chains.js:493` — `if (altText)` silently skips the image on null — merchant gets no alt text and no signal
- `packages/functions/src/controllers/auditAgentController.js:144` — handler answers 200 after the swallowed failure, matching the 200/1.126s request log

## Evidence
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.tag="[getVisionCompletion]"`
- 2 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-05T18:50:00Z" AND timestamp<="2026-08-05T19:05:00Z" AND labels.execution_id="gg9n826ms9lj"`
- 10 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T18:57:00Z" AND timestamp<="2026-08-05T19:00:00Z" AND httpRequest.requestUrl:"fix-issue"`

## Job
- analyze rounds: 2
- cost: $3.82
- branch: `fix/prod-blog-s0kn2e`
- fix commit: `0fc192c4742369785e11950fd685ebe64ff225d6`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/860
- tests: 362 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/services/auditAgent/chains.js |  6 +++++-
 packages/functions/src/services/openAi.service.js    | 10 +++++++++-
 2 files changed, 14 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
