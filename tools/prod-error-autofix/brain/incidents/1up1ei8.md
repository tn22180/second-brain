fingerprint: 1up1ei8
service: resumestuckbulkfixjobsgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T15:34:31.939Z
status: infra
attempt: 1

# SEO · resumestuckbulkfixjobsgen2 · 1up1ei8

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a bounded platform-side container-start fault in avada-seo/us-central1 on 2026-09-01 (~14:56Z–15:33Z) made one resumestuckbulkfixjobsgen2 cold start fail Cloud Run's 240s STARTUP TCP probe, so the Cloud Scheduler POST waiting on it was answered 503 'instance failed the readiness check'. Duplicate of already-recorded fingerprint 9y4a2r (same service, same window, infra, no MR).

**Mechanism.** The scheduled */15 invocation POST https://us-central1-avada-seo.cloudfunctions.net/resumeStuckBulkFixJobsGen2 (userAgent Google-Cloud-Scheduler, remoteIp 35.243.23.32) entered at ~14:56:15.97Z on revision resumestuckbulkfixjobsgen2-00016-xod at zero warm instances, so it had to pay a cold start. The container never bound :8080: 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.' Cloud Run then answered the queued request 503 at 15:00:17.138175Z with latency 241.166811s — the 240s startup-probe deadline plus scheduling, i.e. P4: the latency identifies which limit fired, not app code. The handler at packages/functions/src/handlers/cron/resumeStuckBulkFixJobs.js:10 was never entered — no stderr line exists for that execution, and the next scheduled run at 15:16:31.282942Z logged '[resumeStuckBulkFixJobs] scan complete scanned 0 stuck 0 resumed 0 expired 0 failedProducts 0' on the identical revision, so the image boots and the code is fine. Not this service's config: fleet-wide, avada-seo/us-central1 logged 0 'STARTUP TCP probe failed' entries in the 13:00Z hour and 0 in the 14:00Z hour, then 35 across 8 distinct services in the 15:00Z hour (authgen2 20, handleoptimizeimagegen2 8, fixauditcontentgen2 2, resumestuckbulkfixjobsgen2 1, apigen2 1, handlegenfaqsgen2 1, partnerintegrationsubscribergen2 1, updateshopswithaiusagesubscriptionexpiredtodaygen2 1), bounded 15:00:55.778238Z–15:32:49.123800Z — the same platform window already recorded as 9y4a2r and 1sc23g3. P3 OOM ruled out: zero 'Memory limit' lines on this service, and an OOM would not produce a startup-probe DEADLINE_EXCEEDED before module load. Over the full day this service logged 18 successful startup probes against this 1 failure. Blast radius: one skipped recovery scan; the */15 schedule re-ran 16 minutes later and scanned clean (0 stuck), so no bulk-fix job was left stranded.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:94` — resumeStuckBulkFixJobsGen2 export — the Cloud Run service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:95` — {timeoutSeconds: 540, memory: '1GiB', schedule: '*/15 * * * *'} — no minInstances, so every 15-minute tick can pay a full cold start; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/cron/resumeStuckBulkFixJobs.js:10` — the scan handler — never entered for the failed execution; it logged a clean scan on the very next tick from the same revision

## Evidence
- 2 matching entries: `(resource.labels.service_name="resumestuckbulkfixjobsgen2") AND timestamp>="2026-09-01T14:49:23.278Z" AND timestamp<="2026-09-01T15:19:23.278Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="resumestuckbulkfixjobsgen2") AND timestamp>="2026-09-01T14:49:23.278Z" AND timestamp<="2026-09-01T15:19:23.278Z" AND httpRequest.status>=500`
- 35 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T15:00:00Z" AND timestamp<="2026-09-01T15:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 18 matching entries: `(resource.labels.service_name="resumestuckbulkfixjobsgen2") AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 1 matching entries: `(resource.labels.service_name="resumestuckbulkfixjobsgen2") AND timestamp>="2026-09-01T14:49:23.278Z" AND timestamp<="2026-09-01T15:19:23.278Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.44

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
