fingerprint: mumebf
service: authgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T04:39:25.174Z
status: infra
attempt: 1

# SEO · authgen2 · mumebf

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint 1e908f9 (already recorded infra, no MR): the same platform-side container-start fault in avada-seo/us-central1 on 2026-08-14 ~04:05-04:19Z, which stopped Cloud Run replacing authgen2's single warm instance — 69 authgen2 start attempts failed the default startup TCP probe with DEADLINE_EXCEEDED and 5 more died with `Error: EIO: i/o error, read` reading /workspace/node_modules, so POST /auth/webhook/shop/update was answered 500 before any container ran.

**Mechanism.** authGen2 is declared onRequest({memory:'1GiB', region:'us-central1', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:82-83), so all shop/update webhook traffic rides one instance and has no warm spare. When that instance stopped serving at 04:05:25Z, the autoscaler tried to start replacements and 69 of them logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 ... Connection failed with status DEADLINE_EXCEEDED' between 03:53 and 04:25Z — the alerted string. Five attempts got far enough to log a cause in stderr: 'Provided module can't be loaded.' / 'Detailed stack trace: Error: EIO: i/o error, read' with the stack terminating at Object.readSync → readFileSync on /workspace/node_modules/googleapis/build/src/apis/{sheets,cloudfunctions}/index.js and three ESM getSourceSync loads (04:10:31.355Z, 04:12:52.369Z, 04:13:07.309Z, 04:13:08.439Z, 04:13:08.451Z). EIO on the read-only container image filesystem cannot be produced by app code — the process dies before any module of packages/functions/src is evaluated, which is also why the errors read carries no application log line. The fault is not service-specific: the identical probe-failure line fired 254 times across 13 distinct avada-seo services in the same 32 minutes (authgen2 69, onupdateshopgen2 61, handleproderroralertgen2 33, proxygen2 23, embedappgen2 23, changelogtriggers-shops 18, extensiongen2 10, apigen2 7, partnerintegrationsubscribergen2 4, optimizestoresubscribergen2 2, bulkauditfixdispatchgen2 2, updateshopswithaiusagesubscriptionexpiredtodaygen2 1, optimizesubscriberv2gen2 1), on different revisions and different images, with no deploy in the window (revision authgen2-00320-qaz created 2026-08-13T09:10:06Z, 19h earlier). All 200 sampled requests in the pulled window are POST /auth/webhook/shop/update 500s carrying 'The request failed because the instance could not start successfully', 200 of them inside a 37-second slice (04:22:58.150Z–04:23:35.023Z), i.e. Shopify webhook redelivery of the earlier 500s. Same window, same service and same fault already recorded as fingerprint 1e908f9 (5298 500s), and the sibling services already recorded as 1bpp1pw / mr1olj / e9i6k0 / 17wg4ve / 15mknix.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:82` — authGen2 export — the service whose cold starts failed the startup TCP probe
- `packages/functions/src/handlers/exports/httpFunctions.js:83` — {memory:'1GiB', region:'us-central1', ...vpcSettings} with no minInstances — the only app-side contribution is exposure: one instance serves all shop/update webhooks, so losing it blackholes the endpoint until a replacement starts

## Evidence
- 69 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:53:00Z" AND timestamp<="2026-08-14T04:25:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 254 matching entries: `timestamp>="2026-08-14T03:53:00Z" AND timestamp<="2026-08-14T04:25:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 5 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:53:00Z" AND timestamp<="2026-08-14T04:25:00Z" AND textPayload:"EIO: i/o error"`
- 200 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-14T03:53:35.065Z" AND timestamp<="2026-08-14T04:23:35.065Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.48

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
