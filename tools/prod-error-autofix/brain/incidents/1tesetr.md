fingerprint: 1tesetr
service: webhookcreateproductgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T07:43:09.037Z
status: infra
attempt: 1

# SEO · webhookcreateproductgen2 · 1tesetr

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: one cold-start container of webhookcreateproductgen2, started by a Cloud Run DEPLOYMENT_ROLLOUT at 2026-08-14T04:27:26Z, failed to bind :8080 within the service's 240s default startup TCP probe and was discarded — one of 593 identical startup-probe failures across ~80 unrelated avada-seo services in the same 04:00–05:30Z window, and it failed zero requests.

**Mechanism.** webhookCreateProductGen2 is declared onRequest({timeoutSeconds: 60, memory: '1GiB', ...vpcSettings}, createProductHook) with no minInstances (packages/functions/src/handlers/exports/httpFunctions.js:124-126), so every new revision rollout starts a fresh container. `gcloud run services describe webhookcreateproductgen2` reports startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} and resources cpu=1;memory=1024Mi. Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' at 04:27:26.112753Z on revision webhookcreateproductgen2-00319-tav; the alerted line 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … DEADLINE_EXCEEDED' fired at 04:31:30.410392Z — 244.30s later, matching the configured 240s probe deadline to within log granularity (P4: the latency identifies which limit fired). Cloud Run immediately started a replacement at 04:31:37.198956Z, which logged 'STARTUP TCP probe succeeded' at 04:35:02.093160Z, so the rollout completed. Blast radius is zero: the requests read (httpRequest.status>=500) returned 0 entries in the window and a full-day query over 2026-08-14 for this service returned no 5xx at all — only 4 probe-succeeded lines and this single failure. P3 OOM is ruled out: zero 'Memory limit' lines on this service for the whole day, and the container emitted no application log (stderr read = 0 entries), consistent with a process killed before module load finished rather than a defect in createProductHook. P7 applies to the empty stderr/app-error picture: this app's helpers/logger.js is bare console.*, but here there is genuinely nothing to read because no request ever reached the container. The fault is not service-specific — in 04:00–05:30Z the same 'STARTUP TCP probe failed' text appeared 593 times across ~80 distinct services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37, extensiongen2 31 …), on different revisions and different images, with unchanged code. That is the same platform-side container-start fault already recorded as infra for this date under fingerprints 1lwydlk / 1r74ll6 / 1db4z7z / mr1olj and others.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:124` — webhookCreateProductGen2 export — the service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/httpFunctions.js:125` — {timeoutSeconds: 60, memory: '1GiB', ...vpcSettings} — no minInstances, so every revision rollout pays a full cold start; 1GiB with zero 'Memory limit' lines that day rules out P3 OOM

## Evidence
- 8 matching entries: `resource.labels.service_name="webhookcreateproductgen2" AND timestamp>="2026-08-14T04:17:00Z" AND timestamp<="2026-08-14T04:40:00Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 5 matching entries: `resource.labels.service_name="webhookcreateproductgen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Memory limit" OR httpRequest.status>=500)`

## Job
- analyze rounds: 1
- cost: $1.19

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
