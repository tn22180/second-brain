fingerprint: 1gpxu2r
service: api
message: [get] aEP73QGbK92XdI1g3dvR Error Create knowledge base Error: 400 Server tool request failed
app: BLOG
repo: blogs
date: 2026-08-22T04:13:41.727Z
status: fix_disabled
attempt: 1

# BLOG · api · 1gpxu2r

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Every knowledge-base generation call fails: the app issues OpenAI's hosted `web_search_preview` server-tool request against OpenRouter's Responses endpoint (openAiService is a Proxy over the OpenRouter client), and OpenRouter answers HTTP 400 "Server tool request failed" for 100% of those calls — 33 in 24h (12 on api GET /api/knowledge-base, 21 on the knowledgebase Pub/Sub subscriber), zero successes.

**Mechanism.** knowledgeBaseController.get calls openAiService.responses.create({model: MODEL_GPT_4O_MINI, tools:[{type:'web_search_preview'}]}) (src/controllers/knowledgeBaseController.js:84-88). openAiService is a Proxy that returns the OpenRouter client, baseURL https://openrouter.ai/api/v1 (src/services/openrouter/index.js:9), so the OpenAI-hosted-tool payload — plus the bare legacy model id 'gpt-4o-mini', never passed through resolveModel (src/services/openAi.service.js:41) — goes to OpenRouter. OpenRouter's server-side tool execution rejects it with 400 'Server tool request failed'; the openai SDK raises APIError at core.js:302 and the await at knowledgeBaseController.js:84 (lib line 93 in the stack) throws. There is no retry and no fallback: the catch at :104 logs at logger.error (severity ERROR → the alert) and returns HTTP 200 with knowledgeBase:'' (:106-110), so the merchant sees an empty knowledge base and shop.isKnowledgeBase is never set — which is why the same shops retry (zKZu5DGW5LCKXDIxs9MO 3× in 48 min). The identical call in the Pub/Sub path (src/handlers/pubsub/subscribeKnowledgeBase.js:32-35) fails the same way, proving the fault is the AI call, not the HTTP handler.

Confidence: `high`

## Code
- `packages/functions/src/controllers/knowledgeBaseController.js:84` — the awaited openAiService.responses.create that throws — stack frame `async get (lib/controllers/knowledgeBaseController.js:93)`
- `packages/functions/src/controllers/knowledgeBaseController.js:86` — tools:[{type: TOOL_SEARCH_PREVIEW}] — the OpenAI hosted server tool that OpenRouter rejects
- `packages/functions/src/controllers/knowledgeBaseController.js:105` — logger.error('[get]', shopId, 'Error Create knowledge base', e) — exact alert text
- `packages/functions/src/controllers/knowledgeBaseController.js:106` — catch returns 200 with knowledgeBase:'' — why requests read 200 and requests=0 for status>=500
- `packages/functions/src/services/openAi.service.js:23` — TOOL_SEARCH_PREVIEW = 'web_search_preview'
- `packages/functions/src/services/openAi.service.js:45` — openAiService Proxy delegates every property to getOpenRouterClient() — the request never reaches OpenAI
- `packages/functions/src/services/openrouter/index.js:9` — baseURL 'https://openrouter.ai/api/v1' — the 400 comes from OpenRouter
- `packages/functions/src/services/openAi.service.js:41` — resolveModel exists to map legacy 'gpt-4o-mini' to an OpenRouter id; this call path bypasses it
- `packages/functions/src/handlers/pubsub/subscribeKnowledgeBase.js:32` — duplicate of the same call, failing identically on the knowledgebase service — 21 occurrences

## Evidence
- 12 matching entries: `resource.labels.project_id="avada-blog-app" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-21T00:00:00Z" AND jsonPayload.message:"Error Create knowledge base"`
- 21 matching entries: `resource.labels.project_id="avada-blog-app" AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z" AND jsonPayload.message:"subscribeKnowledgeBase"`
- 176 matching entries: `resource.labels.service_name="api" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-08-20T00:00:00Z" AND timestamp<="2026-08-21T00:00:00Z" AND httpRequest.requestUrl:"knowledge-base"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-20T05:44:58.840Z" AND timestamp<="2026-08-20T06:14:58.840Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.93

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
