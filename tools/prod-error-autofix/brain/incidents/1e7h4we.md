fingerprint: 1e7h4we
service: api
message: [handleUploadFile] tH6d0gSmtL7cwW0t9unt Upload file error Error: Upload failed: <?xml version='1.0' encoding='UTF-8'?><Error><Code>InternalError</Code><Message>We encountered an internal error. Please try again.</Message><Details>AGoHtfhzMQmuxnaw5vpQAdHUB6d2YnQKQXsjKNYiHsp1l7srES3rbdn5cjkM8szFpP/6NY
app: BLOG
repo: blogs
date: 2026-09-28T03:57:37.429Z
status: fix_disabled
attempt: 1

# BLOG · api · 1e7h4we

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The single staged-upload POST from handleUploadFile to Shopify's staged target (Google Cloud Storage) came back with an HTTP-error XML body `<Code>InternalError</Code>`, and that fetch has no retry, so one transient upstream 5xx aborted the whole image upload.

**Mechanism.** handleUploadFile gets a stagedUploadsCreate target from Shopify, then POSTs the multipart form to that target URL with a bare `fetch` (packages/functions/src/services/shopifyGraphQlService.js:137) — no retry wrapper, no timeout, no status-based backoff. GCS answered non-2xx with the XML body `<?xml ...><Error><Code>InternalError</Code><Message>We encountered an internal error. Please try again.</Message>...`, so `!uploadResponse.ok` fired and line 148 threw `Upload failed: <that XML>`. The catch at :211 logged `[handleUploadFile] tH6d0gSmtL7cwW0t9unt Upload file error` at severity ERROR and re-threw as `File upload failed: ...`, which the `upload` controller caught at packages/functions/src/controllers/shopifyController.js:229 and answered HTTP **200** with `{success:false,error}` — which is why the `requests` read (httpRequest.status>=500) is empty while both application log lines exist at 03:50:47.98Z. Note the inner `createFile` step DOES retry 3× (:151, :201) — only the staged-upload POST, the one step that failed, does not. GCS's own message literally says 'Please try again', and the code never does.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:137` — The staged-upload POST — a bare `await fetch(urlString, {method:'POST', body: form, ...})` with no retry, no timeout, no 5xx handling. This is the call that failed.
- `packages/functions/src/services/shopifyGraphQlService.js:148` — `throw new Error(`Upload failed: ${responseText}`)` — the exact prefix + raw GCS XML body seen in the alert message.
- `packages/functions/src/services/shopifyGraphQlService.js:201` — Proof the asymmetry is real: the inner createFile step retries 3× on any error, while the outer staged-upload POST at :137 retries 0×.
- `packages/functions/src/services/shopifyGraphQlService.js:211` — `logger.error('[handleUploadFile]', shop?.id, 'Upload file error', error)` — emits the alerted ERROR line with tag `[handleUploadFile]` and shop id tH6d0gSmtL7cwW0t9unt.
- `packages/functions/src/controllers/shopifyController.js:229` — `logger.error('[upload]', ...)` — the second ERROR entry at 03:50:47.983077Z, 265µs after the first.
- `packages/functions/src/controllers/shopifyController.js:230` — `ctx.body = {success:false, error}` with no status change, so the request is logged as HTTP 200 — explains counts requests=0 and the round-1 rejected query.

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-28T03:36:06.374Z" AND timestamp<="2026-09-28T04:06:06.374Z" AND jsonPayload.tag="[handleUploadFile]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T00:00:00Z" AND timestamp<="2026-09-28T05:00:00Z" AND jsonPayload.tag="[handleUploadFile]"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T00:00:00Z" AND timestamp<="2026-09-28T05:00:00Z" AND jsonPayload.message:"Upload failed: <?xml"`

## Job
- analyze rounds: 2
- cost: $2.67

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
