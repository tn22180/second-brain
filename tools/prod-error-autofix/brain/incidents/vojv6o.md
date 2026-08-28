fingerprint: vojv6o
service: api
message: [createOne] undefined Error: Invalid shopId
app: BLOG
repo: blogs
date: 2026-08-28T03:37:47.070Z
status: fix_disabled
attempt: 1

# BLOG · api · vojv6o

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Cloud Run revision api-00159-sap (started 2026-08-27T07:30:35Z) still runs the pre-fix FAL-757 build in which createOne reads the session shop from ctx.state?.shopID — a field no middleware ever writes — so shopId is always undefined and createIntegrationKey's guard throws 'Invalid shopId' on every POST /api/integration/keys; the correction (f321b3088, reading getCurrentUser(ctx)?.shopID) merged to master at 2026-08-28T03:21:32Z but is not deployed, because in this repo only a tag deploys production.

**Mechanism.** POST /api/integration/keys → routes/api.js:201 → integrationKeyController.createOne → createIntegrationKey({...data, shopId: <session shop>}) → integrationRepository.js:89 `if (!shopId) throw new Error('Invalid shopId')`. The deployed build passes ctx.state?.shopID; @avada/core's verifyEmbedRequest and the repo's own auth helpers write the session under ctx.state.user (helpers/auth.js:19), and nothing writes ctx.state.shopID, so the value is undefined for every authenticated request. The catch logs the same wrong source, which is why the alert text reads '[createOne] undefined Error: Invalid shopId' with no shop id. Controller answers 200 {success:false,error}, so no request log has status>=500 — that is why the requests read is empty (0) while the error is real. All four failures in the window carry the identical stack at lib/repositories/integrationRepository.js:105 ← lib/controllers/integrationKeyController.js:73, the babel output of those two src symbols.

Confidence: `high`

## Code
- `packages/functions/src/repositories/integrationRepository.js:89` — `if (!shopId) throw new Error('Invalid shopId')` — the exact throw in the alerted stack (lib line 105)
- `packages/functions/src/controllers/integrationKeyController.js:47` — createOne's call site (lib line 73). HEAD reads getCurrentUser(ctx)?.shopID; the deployed revision still has the pre-fix `ctx.state?.shopID`
- `packages/functions/src/helpers/auth.js:19` — getCurrentUser returns ctx.state.user — the only place the session shop exists, proving ctx.state.shopID is always undefined
- `packages/functions/src/controllers/integrationKeyController.js:50` — logger.error('[createOne]', <session shop>, e) — the `undefined` printed in the alert message is this argument
- `packages/functions/src/routes/api.js:201` — router.post('/integration/keys', integrationKeyController.createOne) — the only entry point to this code path

## Evidence
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-28T03:17:20.171Z" AND timestamp<="2026-08-28T03:47:20.171Z" AND severity>=ERROR AND jsonPayload.error.message="Invalid shopId"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-28T04:00:00Z" AND jsonPayload.error.message="Invalid shopId"`
- 3 matching entries: `resource.labels.revision_name="api-00159-sap" AND timestamp>="2026-08-27T07:30:00Z" AND timestamp<="2026-08-27T07:31:00Z"`
- 200 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="api" AND timestamp>="2026-08-28T00:00:00Z" AND timestamp<="2026-08-28T06:00:00Z"`

## Job
- analyze rounds: 2
- cost: $2.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
