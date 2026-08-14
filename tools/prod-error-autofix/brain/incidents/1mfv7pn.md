fingerprint: 1mfv7pn
service: changelogtriggers-subscriptions
message: The request failed because the instance could not start successfully.
app: SEO
repo: seo
date: 2026-08-14T08:45:12.248Z
status: infra
attempt: 1

# SEO · changelogtriggers-subscriptions · 1mfv7pn

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the same platform-side container-start fault that swept avada-seo/us-central1 during the 2026-08-14T04:00–05:30Z window killed six changelogtriggers-subscriptions cold starts, so the Pub/Sub push deliveries got 503/500 without any application code running.

**Mechanism.** Every one of the 6 alerted 5xx entries is a Cloud Run platform message ('The request failed because the instance failed the readiness check' / 'could not start successfully'), never an application error. Six distinct instanceIds (001548f729a9367d…, …72923cccf…, …7297dda52…, …7291cd88d…, …72961c213…, …729a4f80c…) each logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. Connection failed with status DEADLINE_EXCEEDED' between 04:26:04Z and 04:37:05Z, and the five 503 request latencies are 241.13s / 258.05s / 242.11s / 247.11s / 241.13s — pinned to Cloud Run's 240s startup-probe deadline, not to anything the handler does. The stderr read for the service in the window returned 0 entries: the container never bound :8080, so no JS ran and no logger line exists. It is not a bad deploy either — the failing revision changelogtriggers-subscriptions-00256-sen was created 2026-08-13T09:10:07Z, ~19h earlier, and had served fine since; revision -00257-tov (created 04:25:47Z, mid-window) failed the same way. Blast radius confirms the platform: 78 distinct Cloud Run services in avada-seo/us-central1 logged 'STARTUP TCP probe failed' in 04:00–05:30Z, with handleproderroralertgen2 (552) and authgen2 (404) worst hit. The function itself is a thin firestore-bigquery-changelog registration (packages/functions/src/config/changelog.js:8) at memory '1GiB', concurrency 80, timeoutSeconds 60 — unchanged and irrelevant to a container that never started.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:8` — changelogTriggers is registered here via firestore-bigquery-changelog registerV2; the 'subscriptions' collection at :13 is what deploys as the Cloud Run service changelogtriggers-subscriptions. No handler code executed in any of the 6 failures — the container never bound :8080 — so this file is named to show what the service is, not as a defect site.

## Evidence
- 6 matching entries: `resource.labels.service_name="changelogtriggers-subscriptions" AND textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-08-14T04:21:51Z" AND timestamp<="2026-08-14T04:51:51Z"`
- 6 matching entries: `resource.labels.service_name="changelogtriggers-subscriptions" AND timestamp>="2026-08-14T04:21:51Z" AND timestamp<="2026-08-14T04:51:51Z" AND httpRequest.status>=500`
- 1000 matching entries: `textPayload:"STARTUP TCP probe failed" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z"`

## Job
- analyze rounds: 1
- cost: $1.38

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
