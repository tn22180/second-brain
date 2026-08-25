fingerprint: jdoapt
service: onCreateUser
message: FetchError: invalid json response body at <https://app.avada.io/app/api/v1/triggers/VbqxjCMDJL7jTzo2Yato> reason: Unexpected token 'I', "Internal S"... is not valid JSON
app: AEO
repo: llm-ai-search-seo
date: 2026-08-25T11:02:02.209Z
status: fix_disabled
attempt: 1

# AEO · onCreateUser · jdoapt

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The CRM endpoint https://app.avada.io/app/api/v1/triggers/VbqxjCMDJL7jTzo2Yato answered one of 21 installs with a non-JSON "Internal Server Error" body; installApp already catches that FetchError and the invocation finished 'ok', but its catch dumps the raw error object through logger.debug, which is not silenced in prod because onCreateUser has no APP_ENV/LOG_LEVEL set, and Cloud Functions gen1 stack-trace detection elevates the dump to severity=ERROR — so the alert is a swallowed, non-fatal external failure that the logger let escape at ERROR.

**Mechanism.** avadaIO.trigger (packages/functions/src/services/avadaService.js:35) posts through avadaio-node → node-fetch and calls res.json() unconditionally; app.avada.io returned the plain-text body 'Internal S…' so node-fetch threw FetchError type:'invalid-json' (node-fetch/lib/index.js:273). installApp's own catch (packages/functions/src/services/avadaService.js:42-44) caught it — the Promise.all/onCreateShop frames in the trace are just the async await chain, and the execution log shows 'Function execution took 9770 ms, finished with status: ok' for execution_id q39oy1bwzp7j, so nothing failed and nothing retried. The catch calls logger.debug(e) with the whole Error object, so console.log prints util.inspect output over three log lines ('FetchError: … {', "  type: 'invalid-json'", '}') — exactly the three entries in the log. logger.js:18-20 computes env = process.env.APP_ENV || 'development' → defaultLevel 'debug' → currentLevel 3, and `gcloud functions describe onCreateUser` shows the deployed env has neither APP_ENV nor LOG_LEVEL, so the level intended to be silenced in production is live. Gen1's exception detector tags the first line of that stack dump severity=ERROR (entry carries errorGroups id CL3y3Zy3o9O1Wg) while the two continuation lines stay DEFAULT, which is why errors=1 and stderr=0. The deployed build is current: HEAD 4563ab0 is 2026-08-19T01:33Z, the function's updateTime is 2026-08-19T02:31:38Z, and both files are unchanged since 2026-07-01.

Confidence: `high`

## Code
- `packages/functions/src/services/avadaService.js:35` — await avadaIO.trigger(eventId, …) — the avadaio-node/node-fetch call whose res.json() throws FetchError when app.avada.io returns 'Internal Server Error'
- `packages/functions/src/services/avadaService.js:43` — logger.debug(e) dumps the whole Error object (stack + {type:'invalid-json'}), which is what GCP elevated to severity=ERROR; no retry, no message-only log
- `packages/functions/src/helpers/logger.js:18` — env = process.env.APP_ENV || 'development'; APP_ENV is absent from onCreateUser's deployed environmentVariables
- `packages/functions/src/helpers/logger.js:20` — currentLevel resolves to debug(3) because neither LOG_LEVEL nor APP_ENV is set, so debug output that the header claims is 'silenced in prod' is emitted
- `packages/functions/src/handlers/onCreateShop.js:22` — the Promise.all wrapping installApp that supplies the 'async Promise.all (index 0)' frame in the alerted stack

## Evidence
- 10 matching entries: `(resource.labels.function_name="onCreateUser") AND timestamp>="2026-08-25T10:49:00Z" AND timestamp<="2026-08-25T10:52:00Z"`
- 1 matching entries: `(resource.labels.function_name="onCreateUser") AND timestamp>="2026-08-25T10:35:29.747Z" AND timestamp<="2026-08-25T11:05:29.747Z" AND severity>=ERROR`
- 21 matching entries: `(resource.labels.function_name="onCreateUser") AND timestamp>="2026-08-24T11:00:00Z" AND timestamp<="2026-08-25T11:05:29Z" AND textPayload:"Sync to avada io install"`
- 1 matching entries: `(resource.labels.function_name="onCreateUser") AND timestamp>="2026-08-24T11:00:00Z" AND timestamp<="2026-08-25T11:05:29Z" AND textPayload:"FetchError"`

## Job
- analyze rounds: 3
- cost: $4.55

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
