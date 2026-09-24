fingerprint: 1ovt4b8
service: apigen2
message: HTTP 500 GET /api/whats-new
app: SEO
repo: seo
date: 2026-09-23T13:57:20.706Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · 1ovt4b8

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The external Falcon Nexus feed service (https://falcon.avada.net/api/public/whats-new?appId=seoSuite&limit=50) answered HTTP 500, and whatsNewService.falconRequest turns any non-ok upstream response into a thrown Error that whatsNewController.list re-raises as a 500 — so a Falcon outage takes down GET /api/whats-new instead of degrading.

**Mechanism.** Both alerted requests logged `[whatsNewController.list] <shopId> Falcon whats-new ?appId=seoSuite&limit=50 failed with 500` with a stack rooted at falconRequest → fetchAllEntries → getFeed → list. falconRequest (packages/functions/src/services/whatsNewService.js:29-31) does a bare `fetch` of the Falcon Nexus URL with no retry and no timeout, and `if (!response.ok) throw new Error(...)` at :30 converts the upstream 500 into a rejection. fetchAllEntries (:56) awaits it inside the do/while page walk, getFeed (:68) awaits it inside Promise.all, and whatsNewController.list's catch (packages/functions/src/controllers/whatsNewController.js:11-15) sets ctx.status = 500 — one of the few controllers in this repo that answers a real 500 rather than the house `{success:false}` 200. Nothing in the chain has a fallback to the locally-stored read ids, so an upstream fault is a hard failure for the whole endpoint.

Confidence: `high`

## Code
- `packages/functions/src/services/whatsNewService.js:30` — `if (!response.ok) throw new Error(`Falcon whats-new ${path} failed with ${response.status}`)` — produces the exact logged message, and is frame 1 of the prod stack (lib/services/whatsNewService.js:39)
- `packages/functions/src/services/whatsNewService.js:29` — bare `fetch` to FALCON_URL with no timeout, no retry, no status-tolerant path
- `packages/functions/src/services/whatsNewService.js:56` — `const page = await falconRequest(`?${params}`)` inside fetchAllEntries — stack frame `at async fetchAllEntries`; the `?appId=seoSuite&limit=50` path in the message is built at :54
- `packages/functions/src/services/whatsNewService.js:68` — `Promise.all([fetchAllEntries(), getReadIds(shopId)])` in getFeed — stack frame `at async Promise.all (index 0)`; readIds are already available locally but are discarded when the Falcon leg rejects
- `packages/functions/src/services/whatsNewService.js:8` — `WHATS_NEW_APP_ID = appConfig.isProduction ? 'seoSuite' : 'staging'` — confirms the logged appId=seoSuite is the prod branch
- `packages/functions/src/controllers/whatsNewController.js:13` — `ctx.status = 500` in the catch — the line that makes the upstream fault a user-visible HTTP 500; stack frame `at async list (lib/controllers/whatsNewController.js:19)`
- `packages/functions/src/routes/api.js:559` — `router.get('/whats-new', whatsNewController.list)` — binds the alerted path to this controller

## Evidence
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-09-23T13:35:57.810Z" AND timestamp<="2026-09-23T14:05:57.810Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-09-23T13:35:57.810Z" AND timestamp<="2026-09-23T14:05:57.810Z" AND logName:"stderr" AND textPayload:"whatsNewController.list"`
- 164 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-09-23T13:35:57.810Z" AND timestamp<="2026-09-23T14:05:57.810Z" AND logName:"stderr"`
- 2 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-09-23T13:35:57.810Z" AND timestamp<="2026-09-23T14:05:57.810Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.59

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
