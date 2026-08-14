fingerprint: 1bwfmw9
service: onupdateshopgen2
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-08-14T04:50:16.245Z
status: infra
attempt: 1

# SEO · onupdateshopgen2 · 1bwfmw9

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-filesystem fault in avada-seo/us-central1 between 04:01Z and 04:26Z on 2026-08-14 made Node's readFileSync of files inside /workspace/node_modules fail with `EIO: i/o error, read`, so every onupdateshopgen2 cold-start container aborted module load before any application code ran and Cloud Run answered the Eventarc POST / with 500. Duplicate of fingerprints mr1olj / 1bpp1pw / 1mk24ih, already recorded infra with no MR.

**Mechanism.** Firestore onDocumentUpdated on shops/{shopId} (packages/functions/src/handlers/exports/firestoreFunctions.js:13) is delivered by Eventarc as POST https://onupdateshopgen2-pihimpufva-uc.a.run.app/?__GCP_CloudEventsMode=CE_PUBSUB_BINDING. Cold-start containers never got as far as the handler: the functions-framework loader printed `Provided module can't be loaded.` / `Is there a syntax error in your code?` / `Detailed stack trace: Error: EIO: i/o error, read` with a stack that is pure Node CJS loader — `Object.readFileSync (node:fs:440:20)` -> `defaultLoadImpl (node:internal/modules/cjs/loader:1122:17)` -> `Module.require` -> `Object.<anonymous> (/workspace/node_modules/@shopify/koa-shopify-webhooks/index.js:1:18)` at 04:09:45.273Z and `/workspace/node_modules/googleapis/build/src/apis/apigateway/index.js:18:18` at 04:26:12.182Z, then `Could not load the function, shutting down.` Two different third-party files failed on two different containers, so this is not a bad import or a syntax error in src/ — the same file loads fine on every other container. The process exit meant :8080 was never bound, which is exactly the 62 `Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.` entries, and Cloud Run returned `The request failed because the instance could not start successfully.` (80 entries) / `failed the readiness check` (29) / `no available instance` (29) to the deliveries: 124 x 500 and 36 x 503 on POST / across 04:01:52Z-04:25:23Z. Not app-scoped: the same `EIO: i/o error, read` string appears in the same 30-minute window on 6 other avada-seo services (authgen2 7, embedappgen2 3, handleproderroralertgen2 2, changelogtriggers-shops 2, changelogtriggers-shopinfos 1, apigen2 1), which no single function's code can explain. No app-side log line exists for any of the 160 failed requests because the container died before onUpdateShopHandler was ever required.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/firestoreFunctions.js:13` — onUpdateShopGen2 = onDocumentUpdated on shops/{shopId} — the alerting function; its Eventarc deliveries are the POST / requests that 500'd
- `packages/functions/src/handlers/exports/firestoreFunctions.js:15` — the handler body that never ran — module load aborted before onUpdateShopHandler was required, so no app-side catch or log exists
- `packages/functions/src/handlers/exports/firestoreFunctions.js:5` — the src-side import chain is intact and unchanged; the EIO failures are on /workspace/node_modules files (@shopify/koa-shopify-webhooks, googleapis), not on this tree

## Evidence
- 3 matching entries: `(resource.labels.service_name="onupdateshopgen2" OR resource.labels.function_name="onupdateshopgen2") AND timestamp>="2026-08-14T03:56:15Z" AND timestamp<="2026-08-14T04:26:15.277Z" AND textPayload:"EIO: i/o error"`
- 19 matching entries: `resource.type="cloud_run_revision" AND resource.labels.location="us-central1" AND timestamp>="2026-08-14T03:56:00Z" AND timestamp<="2026-08-14T04:30:00Z" AND textPayload:"EIO: i/o error"`
- 42 matching entries: `(resource.labels.service_name="onupdateshopgen2" OR resource.labels.function_name="onupdateshopgen2") AND timestamp>="2026-08-14T03:56:15.277Z" AND timestamp<="2026-08-14T04:26:15.277Z" AND logName:"stderr"`
- 160 matching entries: `(resource.labels.service_name="onupdateshopgen2" OR resource.labels.function_name="onupdateshopgen2") AND timestamp>="2026-08-14T03:56:15.277Z" AND timestamp<="2026-08-14T04:26:15.277Z" AND httpRequest.status>=500`
- 200 matching entries: `(resource.labels.service_name="onupdateshopgen2" OR resource.labels.function_name="onupdateshopgen2") AND timestamp>="2026-08-14T03:56:15.277Z" AND timestamp<="2026-08-14T04:26:15.277Z" AND severity>=ERROR`

## Job
- analyze rounds: 3
- cost: $3.37

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
