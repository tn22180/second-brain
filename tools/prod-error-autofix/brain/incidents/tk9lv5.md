fingerprint: tk9lv5
service: api
message: [setupTemplates] error create template HTTPError: Response code 422 (Unprocessable Entity)
app: BLOG
repo: blogs
date: 2026-10-08T04:06:35.540Z
status: fix_disabled
attempt: 2

# BLOG · api · tk9lv5

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** On one shop's main theme Shopify rejects the create of `templates/page.avada-articles-tags.liquid` with HTTP 422, and because setupTemplates probes only the `.liquid` key (404 → `undefined`) it re-issues the same rejected create on every login — 8/8 identical 422s in 48h, all inside one 32-minute admin session of a single merchant, with the Shopify 422 body dropped by the logger so the rejection reason is unknowable from the logs.

**Mechanism.** `afterLoginService` fires the theme setup as fire-and-forget (`void setupTemplates(...)`, after-login.service.js:37) on each session-token login — the enclosing request for the 05:32:28.334Z error is `GET /api/shops` 200, spanId 42ebeafcba2b7c22 (dec 4822206197206318114) at 05:32:27.667Z, which is why the `requests` read has 0 entries: the failure never touches an HTTP status. Inside setupTemplates, `shopify.asset.get(themeId, {'asset[key]': 'templates/page.avada-articles-tags.liquid'})` (line 97) 404s, line 101 maps 404 to `undefined` as the expected absent case (confirmed by zero `error get template page tag` lines in the window), so line 110 falls through to `shopify.asset.create` (line 111). Shopify answers 422 Unprocessable Entity; got raises HTTPError ERR_NON_2XX_3XX_RESPONSE; line 112 logs it with neither the shop id/domain (which line 102–108 does log) nor `e.response.body`, so Shopify's `{"errors":{…}}` detail is discarded. Nothing records the rejection, so the next login repeats the identical create — 8 attempts in 32 minutes, errorGroup CNeyh87SoYX1zAE, all revision api-00184-qup.

Confidence: `medium`

## Code
- `packages/functions/src/services/after-login.service.js:37` — fire-and-forget launch per login — explains repetition and why no 5xx exists for these errors
- `packages/functions/src/services/after-login.service.js:97` — existence probe queries only the .liquid key, so any same-name sibling template is invisible to it
- `packages/functions/src/services/after-login.service.js:101` — 404 → undefined, which is the gate that lets the rejected create be retried forever
- `packages/functions/src/services/after-login.service.js:111` — the asset.create whose 422 is the alert
- `packages/functions/src/services/after-login.service.js:112` — logs the HTTPError without shop id/domain or e.response.body — the reason for the 422 is destroyed here

## Evidence
- 8 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-06T00:00:00Z" AND timestamp<="2026-10-08T00:00:00Z" AND jsonPayload.tag="[setupTemplates]"`
- 1 matching entries: `resource.labels.service_name="api" AND logName="projects/avada-blog-app/logs/run.googleapis.com%2Frequests" AND timestamp>="2026-10-07T05:32:20Z" AND timestamp<="2026-10-07T05:32:30Z" AND httpRequest.requestUrl:"/api/shops"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-07T05:06:59Z" AND timestamp<="2026-10-07T05:36:59Z" AND jsonPayload.tag="[getCrmWidgets]"`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
