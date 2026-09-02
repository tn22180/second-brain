fingerprint: mzokuq
service: webhookpublishthemegen2
message: HTTP 504 POST /webhook/publishTheme
app: SEO
repo: seo
date: 2026-09-01T15:54:30.203Z
status: fix_disabled
attempt: 1

# SEO · webhookpublishthemegen2 · mzokuq

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** webhookPublishThemeGen2 is declared with no `minInstances` and no `timeoutSeconds` override, so it runs on the firebase-functions/v2 default 60s request timeout with zero warm capacity; the alerted POST /webhook/publishTheme landed on a cold start whose container took 61.19s to bind :8080, and Cloud Run returned 504 at exactly 59.999s before the handler ever ran.

**Mechanism.** Shopify-Captain-Hook POSTed /webhook/publishTheme at 2026-09-01T15:30:28.528116Z. No instance was warm, so Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' at 15:30:29.129512Z on instance 00a41e8c1da1c924…, and the request queued waiting for container start. That container's 'Default STARTUP TCP probe succeeded' only at 15:31:29.717497Z — 61.19s after start, versus 19.25s (15:00:54.072→15:01:13.325) and 37.30s (15:10:26.992→15:11:04.296) and 21.10s (15:52:14.318→15:52:35.421) for the other three cold starts in the same hour. The request's own deadline expired first: httpRequest.latency 59.999206817s, status 504, and `webhookPublishThemeGen2 = onRequest({memory: '1GiB', ...vpcSettings}, themeHook)` (packages/functions/src/handlers/exports/httpFunctions.js:122) passes no timeoutSeconds, so the gen2 default of 60s applied, and no minInstances, so nothing was warm. themeHook never executed — that is why stderr is empty and no `[publishTheme]` line exists: verifyWebhook and publishTheme both log inside try/catch (packages/functions/src/handlers/webhook/themeHook.js:39, packages/functions/src/middleware/webhook/webhookMiddleware.js:40) and neither fired. The sibling webhook one screen up pins minInstances: 1 for exactly this failure mode (packages/functions/src/handlers/exports/httpFunctions.js:113), so the fix pattern already exists in this file.

Confidence: `high`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:122` — webhookPublishThemeGen2 declared with neither timeoutSeconds nor minInstances — inherits the gen2 60s request timeout with zero warm capacity, which the 59.999s 504 matches to the millisecond
- `packages/functions/src/handlers/exports/httpFunctions.js:113` — webhookBulkOperationGen2 pins {timeoutSeconds: 60, minInstances: 1} with a comment saying it exists so a Shopify webhook delivery doesn't hit a cold start and fail — the same lever, already applied to a sibling webhook in the same file
- `packages/functions/src/handlers/webhook/themeHook.js:39` — publishTheme's catch logs every failure via logger.error; the absence of any [publishTheme] line proves the handler never ran, i.e. the failure is pre-handler (container start), not inside the theme-backup logic
- `packages/functions/src/middleware/webhook/webhookMiddleware.js:40` — verifyWebhook also logs and always answers HTTP 200 on any rejection path, so an HMAC or verification failure could not have produced a 504 — rules out the middleware as the cause

## Evidence
- 1 matching entries: `resource.labels.service_name="webhookpublishthemegen2" AND timestamp>="2026-09-01T15:16:30Z" AND timestamp<="2026-09-01T15:46:30Z" AND httpRequest.status=504`
- 8 matching entries: `resource.labels.service_name="webhookpublishthemegen2" AND timestamp>="2026-09-01T15:00:00Z" AND timestamp<="2026-09-01T16:00:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe succeeded")`
- 5 matching entries: `resource.labels.service_name="webhookpublishthemegen2" AND timestamp>="2026-09-01T15:29:00Z" AND timestamp<="2026-09-01T15:32:00Z" AND labels.instanceId="00a41e8c1da1c924a5b539588a6509d8d5ee9640fe18d8eb4868108ca06dee65896c7a6567776d2e17b8094c7220beae5fce46a4373af92d5b1eb9f50df6cbf460a5cbc2ddb176a24d3c910b"`

## Job
- analyze rounds: 3
- cost: $4.04

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
