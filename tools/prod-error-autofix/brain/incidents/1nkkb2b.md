fingerprint: 1nkkb2b
service: api
message: [fixAuditIssue] OOXtLxadNvXkaPUPv2qs Error in fixAuditIssue: ZodError: [
app: BLOG
repo: blogs
date: 2026-09-14T08:36:11.868Z
status: fix_disabled
attempt: 1

# BLOG · api · 1nkkb2b

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** POST /api/audit-agent/fix-issue (issueType KEYPHRASE) for shop OOXtLxadNvXkaPUPv2qs / article 570632470582 returned 500 because both providers answered generateKeyword with syntactically valid JSON whose `keyword` is an empty/whitespace string — gemma4:31b on Ollama failed keywordSchema (fell back), then OpenRouter (gpt-5.1 → pro model, response_format degraded to bare json_object because keywordSchema has a .transform) answered the same shape, and parseJsonCompletion's `schema.parse(parsed)` throws the ZodError straight to fixAuditIssue's catch, which maps every error to 500.

**Mechanism.** Log chain on instance 00a41e8c1d93ee8e2640, one request (08:30:33.611Z, latency 1.698s): 08:30:33.961 `[ollamaRoute] audit_agent_keywords z.toJSONSchema failed Transforms cannot be represented in JSON Schema` (keywordSchema ends in .transform at Schema/auditAgentSchemas.js:115, so Ollama gets only the JSON_GUARD sentence, no schema) → 08:30:34.356 `[ollamaRoute] auditAgent failed, falling back to OpenRouter [ollama] completion did not match the audit_agent_keywords schema` (completeViaOllama's safeParse guard, ollamaRoute.js:195) → 08:30:34.357 `[getCompletion] z.toJSONSchema failed, falling back to json_object audit_agent_keywords` (openAi.service.js:148-155: same transform makes the OpenRouter leg drop from strict json_schema to unconstrained {type:'json_object'}) → 08:30:35.309 ZodError `too_small … path ["keyword"]` from parseJsonCompletion. The error is `too_small`, not `invalid_union`, which in zod v4 means exactly one union branch failed non-abortively: the `{keyword: z.string().trim().min(1)}` branch, i.e. the completion was `{"keyword": ""}` (or whitespace, since .trim() runs before .min(1)). parseJsonCompletion only retries when the text is not JSON (chains.js:117-136); a JSON-valid but schema-invalid completion goes to `schema.parse(parsed)` at chains.js:138 with no retry, and the ZodError propagates generateKeyword (chains.js:319) → handlers[KEYPHRASE] (auditAgentController.js:74) → catch at auditAgentController.js:150-153 → status 500. Both providers producing an empty keyword in <1s each points at the page input carrying nothing to derive a keyword from, but the request body is not logged, so that part is inference. Scope: 158 audit_agent_keywords calls in 7 days, 1 Ollama schema-mismatch fallback, 1 ZodError — a one-off. The merchant's next 7 fix-issue calls on the same article (08:30:38–08:31:35) all 200'd and none re-ran the keyword fix.

Confidence: `high`

## Code
- `packages/functions/src/services/auditAgent/chains.js:138` — `return schema.parse(parsed)` — throws the alerted ZodError; the JSON-repair/retry above only covers non-JSON text, not a JSON-valid completion that fails the schema
- `packages/functions/src/services/auditAgent/chains.js:117` — retry branch is entered only when parse(raw) throws (not valid JSON); `{"keyword":""}` parses fine and skips it
- `packages/functions/src/services/auditAgent/chains.js:319` — generateKeyword → parseJsonCompletion with keywordSchema, name 'audit_agent_keywords', model DEFAULT_MODEL_5 — frame in the alerted stack
- `packages/functions/src/Schema/auditAgentSchemas.js:102` — `.trim().min(1)` on keyword — the check that produced `too_small`, minimum 1, path ['keyword']
- `packages/functions/src/Schema/auditAgentSchemas.js:115` — `.transform(...)` on the union — the reason z.toJSONSchema throws for this schema on both the Ollama and OpenRouter legs (logged 158× and 1× in 7 days), leaving the model unconstrained
- `packages/functions/src/services/openAi.service.js:148` — catch of z.toJSONSchema → response_format degraded to bare {type:'json_object'}; logged at 08:30:34.357Z for this request
- `packages/functions/src/services/aiContent/ollamaRoute.js:195` — `zodSchema.safeParse(parsed).success` guard — produced the 08:30:34.356Z 'did not match the audit_agent_keywords schema' fallback
- `packages/functions/src/controllers/auditAgentController.js:74` — KEYPHRASE handler → generateKeyword(data)
- `packages/functions/src/controllers/auditAgentController.js:151` — catch-all logs the ZodError at logger.error (the alerted line) and answers 500 with 'Failed to process request'

## Evidence
- 5 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-14T08:30:33Z" AND timestamp<="2026-09-14T08:30:36Z" AND labels.instanceId:"00a41e8c1d93ee8e2640"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-07T00:00:00Z" AND jsonPayload.message:"Error in fixAuditIssue"`
- 161 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-07T00:00:00Z" AND jsonPayload.message:"audit_agent_keywords"`
- 15 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-07T00:00:00Z" AND textPayload:"falling back to OpenRouter"`
- 8 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-14T07:30:00Z" AND timestamp<="2026-09-14T09:30:00Z" AND httpRequest.requestUrl:"/api/audit-agent/fix-issue" AND httpRequest.referer:"id=570632470582"`

## Job
- analyze rounds: 1
- cost: $3.35

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
