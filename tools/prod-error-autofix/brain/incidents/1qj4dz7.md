fingerprint: 1qj4dz7
service: handlegenfaqsgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-09-01T15:40:40.757Z
status: infra
attempt: 1

# SEO · handlegenfaqsgen2 · 1qj4dz7

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a bounded platform-side container-start fault in avada-seo/us-central1 during the 2026-09-01 15:00–15:30Z window made one handlegenfaqsgen2 cold start fail Cloud Run's 240s STARTUP TCP probe, so the single Pub/Sub push waiting on that cold start was answered 503 'instance failed the readiness check'.

**Mechanism.** handleGenFaqsGen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'handleGenFaqs', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:328-331), so a handleGenFaqs message arriving at zero warm instances pays a full cold start. The Pub/Sub push POST https://handlegenfaqsgen2-…/?__GCP_CloudEventsMode=CUSTOM_PUBSUB_projects/avada-seo/topics/handleGenFaqs (UA 'APIs-Google') was routed to instance 00a41e8c1d5ae40e… on revision handlegenfaqsgen2-00351-gul; that container never bound :8080, Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080… Connection failed with status DEADLINE_EXCEEDED' at 15:24:38.873919Z, and the request was answered 503 with latency 244.202846s — the 240s startup-probe deadline plus scheduling (P4: the latency identifies which limit fired). Not this service's code: the same probe-failure line fired across 8 avada-seo services in the 15:00Z hour (authgen2 22, handleoptimizeimagegen2 8, fixauditcontentgen2 2, updateshopswithaiusagesubscriptionexpiredtodaygen2 1, resumestuckbulkfixjobsgen2 1, partnerintegrationsubscribergen2 1, handlegenfaqsgen2 1, apigen2 1 = 37 total) against 0 in the whole 14:00Z hour and 0 in the whole 13:00Z hour — the same bounded platform window already recorded on 2026-09-01 under fingerprints 1sc23g3, 9y4a2r and 1up1ei8. P3 OOM ruled out: zero 'Memory limit' lines on handlegenfaqsgen2 in 24h. The image boots fine — 9 STARTUP TCP probes succeeded on the same service the same day, and the app itself ran normally two minutes later on a different instance (00a41e8c1d6ab939…, stderr '[ollama:generateOllamaStructuredText] Model: gemma4:31b, Schema: faq' at 15:26:47.805493Z and '[incrementAIUsage] Credits consumed rlrtS4g8kJAhzQbuSeVi generateFaqsInBulk 3' at 15:26:47.989947Z). This is the only 5xx on the service in 24h. Blast radius: nil — subscribeGenFaq was never entered (container died before module load, so no partial FAQ writes and no credit spent on that message), and Pub/Sub redelivers the push.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:328` — handleGenFaqsGen2 export — the Cloud Run service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:329` — {memory:'1GiB', timeoutSeconds:540, topic:'handleGenFaqs'} — no minInstances, so a message at zero warm instances pays a full cold start; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/services/generateBulkService.js:152` — dispatchWork('handleGenFaqs', …) — the publisher whose message was the 503'd push; work is redelivered, not lost

## Evidence
- 2 matching entries: `(resource.labels.service_name="handlegenfaqsgen2" OR resource.labels.function_name="handlegenfaqsgen2") AND timestamp>="2026-09-01T15:11:41.569Z" AND timestamp<="2026-09-01T15:41:41.569Z" AND severity>=ERROR`
- 1 matching entries: `resource.labels.service_name="handlegenfaqsgen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND httpRequest.status>=500`
- 37 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T15:00:00Z" AND timestamp<="2026-09-01T15:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 9 matching entries: `resource.labels.service_name="handlegenfaqsgen2" AND timestamp>="2026-09-01T00:00:00Z" AND timestamp<="2026-09-02T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 2 matching entries: `(resource.labels.service_name="handlegenfaqsgen2" OR resource.labels.function_name="handlegenfaqsgen2") AND timestamp>="2026-09-01T15:11:41.569Z" AND timestamp<="2026-09-01T15:41:41.569Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
