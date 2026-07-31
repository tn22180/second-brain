fingerprint: 1hjewuf
service: api
message: HTTP 500 POST /api/gen-ai-suggested/blog-post-idea-outline
app: BLOG
repo: blogs
date: 2026-07-31T08:48:24.769Z
status: mr_open
attempt: 1

# BLOG · api · 1hjewuf

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/804

**Root cause.** OpenRouter returns a truncated or empty content string for /api/gen-ai-suggested/:type completions with finish_reason != 'length', so getCompletion's truncation guard never fires and genSuggested calls bare JSON.parse on the partial payload, throwing SyntaxError and returning 500.

**Mechanism.** genSuggested calls getCompletion with model 'gpt-4.1', which resolveModel maps to OPENROUTER_GEMINI_2_5_FLASH_LITE (packages/functions/src/const/aiModels.js:19, openAi.service.js:27). getCompletion's retry loop only re-issues when resp.choices[0].finish_reason === 'length' (openAi.service.js:138); anything else breaks out and the raw content is returned unchecked (openAi.service.js:158-161). When the provider ends generation early with finish_reason 'stop' (or null), the content is a half-written JSON document or an empty string. genSuggested then runs bare JSON.parse on it — genAIBlogController.js:229 for recommendBlogPost (prod stack lib/controllers/genAIBlogController.js:259:67) and genAIBlogController.js:337 for blog-post-idea-outline (prod stack lib:354:61) — which throws, hits the catch at genAIBlogController.js:368 and sets ctx.status = 500. All four distinct V8 messages seen in the window are end-of-input class, not malformed-escaping class: reproduced locally on Node 20, JSON.parse('{\n "a": "hello') gives "Unterminated string in JSON at position 14", JSON.parse('') gives "Unexpected end of JSON input", and JSON.parse('{ ') gives "Expected property name or '}' in JSON at position 2", while a raw control character instead gives "Bad control character in string literal" — which is not what any of these 500s carry. So this is truncation, and safeParseJsonCompletion (services/openrouter/safeParseJsonCompletion.js:50), which only repairs control characters, would not have saved it — and genSuggested does not call it anyway. Corroborating negative: zero log entries matching 'output truncated (finish_reason=length)' exist in the same 24h window in which 74 genSuggested SyntaxErrors were logged, i.e. the existing guard fired zero times. Latency 0.95-2.4s is far below the 30s client timeout, so the cut is upstream, not a client-side abort.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genAIBlogController.js:337` — case 'blog-post-idea-outline' — bare JSON.parse(blogPostIdeaRaw), the alerting endpoint; prod stack lib:354:61
- `packages/functions/src/controllers/genAIBlogController.js:229` — case 'recommendBlogPost' — bare JSON.parse(rawRecommentBlog), the other failing type in the window; prod stack lib:259:67
- `packages/functions/src/controllers/genAIBlogController.js:368` — catch that logs '[genSuggested] ... Error genSuggested' and sets 500 — the exact log line in the alert
- `packages/functions/src/services/openAi.service.js:138` — guard only retries on finish_reason === 'length'; an early stop with any other finish_reason passes through unchecked
- `packages/functions/src/services/openAi.service.js:158` — raw content returned with no completeness or JSON-validity check even when needsJsonParse is true
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = OPENROUTER_GEMINI_2_5_FLASH_LITE, what 'gpt-4.1' resolves to for every genSuggested call
- `packages/functions/src/services/openrouter/safeParseJsonCompletion.js:50` — existing repair helper handles control chars only, not truncation, and genSuggested does not use it

## Evidence
- 74 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T08:00:00Z" AND timestamp<="2026-07-31T08:30:00Z" AND jsonPayload.message:"Error genSuggested SyntaxError"`
- 5 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T07:59:47.143Z" AND timestamp<="2026-07-31T08:29:47.143Z" AND jsonPayload.message:"Error genSuggested"`
- 6 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T07:59:47.143Z" AND timestamp<="2026-07-31T08:29:47.143Z" AND httpRequest.status>=500`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-30T08:00:00Z" AND timestamp<="2026-07-31T08:30:00Z" AND jsonPayload.message:"SyntaxError: Unterminated string in JSON"`

## Job
- analyze rounds: 1
- cost: $3.51
- branch: `fix/prod-blog-1hjewuf`
- fix commit: `89eea7c1f025e1c9810991b2a35c115bccd0163b`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/804
- tests: 237 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
.../src/controllers/genAIBlogController.js         |  7 +++-
 .../__tests__/getCompletion.truncation.test.js     | 44 ++++++++++++++++++++++
 packages/functions/src/services/openAi.service.js  | 43 +++++++++++++++------
 3 files changed, 81 insertions(+), 13 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
