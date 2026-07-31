fingerprint: 1ce20uv
service: api
message: HTTP 500 POST /api/gen-ai-suggested/recommendBlogPost
app: BLOG
repo: blogs
date: 2026-07-31T04:44:03.624Z
status: mr_open
attempt: 1

# BLOG · api · 1ce20uv

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/795

**Root cause.** getCompletion silently downgrades the structured-output response_format to plain {type:'json_object'} whenever the caller passes a zod v4 schema, so the search_intent z.enum is never sent to the model; the model occasionally returns an out-of-enum intent string and suggestedRecommentBlog.parse() throws ZodError, which genSuggested's catch turns into HTTP 500.

**Mechanism.** The single 500 in the window pairs exactly with the single ZodError: request log starts 2026-07-31T04:27:55.368303Z with latency 3.266347016s → 04:27:58.634, error logged 04:27:58.637601Z (Δ 4ms), same endpoint POST /api/gen-ai-suggested/recommendBlogPost, revision api-00102-dok. Stack lands on /workspace/lib/controllers/genAIBlogController.js:259 = src/controllers/genAIBlogController.js:229 `suggestedRecommentBlog.parse(JSON.parse(rawRecommentBlog))`. The Zod issue is code invalid_value at path ["suggested_recomment_blog", 3, "search_intent"] — the 4th of 6 generated ideas carried an intent outside the 5-value enum at Schema/zodGenFullBlog.js:9. Chain: genAIBlogController.js:220-226 calls getCompletion with format 'json_object' AND zodSchema suggestedRecommentBlog; packages/functions/package.json:79 pins zod ^4.1.12, so every schema object carries the '~standard' marker; openAi.service.js:100 sets isZodV4 = true and line 101 therefore assigns `{type: 'json_object'}` instead of `zodResponseFormat(zodSchema, name)` — the enum is dropped and the model gets no schema constraint, only the prose contract in the prompt. That prose contract itself names a value the enum does not accept: const/genAIBlog.js:333 instructs "variety across: Informational, Tutorial, Commercial, and (Navigational or Transitional)" — 'Transitional' is a typo for 'Transactional' and is not in SEARCH_INTENT, giving the model an explicit instruction to emit an invalid literal. (The received value is not in the log, so the typo is the likeliest trigger, not a proven one; the shop-locale rule at genAIBlog.js:318-320 — "write every part of the output in {{language}}, do NOT leave any word in another language" — is a second path to a translated, out-of-enum intent.) The failure is sampling-dependent, not config-broken: 31 of 32 /api/gen-ai-suggested/* requests between 00:00 and 04:43 returned 200, including 04:26:29 and 04:28:03 on the same endpoint, so ~3% of calls trip it. genAIBlogController.js:368-369 logs '[genSuggested] … Error genSuggested' and sets ctx.status = 500, which is the alert text. NOTE — this fingerprint holds two causes: over the prior 24h the same tag logged 68 SyntaxError (P1 truncation family, last one 2026-07-30T23:30:12Z) against this 1 ZodError. This alert's 500 is the ZodError; the SyntaxError family is separate and was not active in the window.

Confidence: `medium`

## Code
- `packages/functions/src/services/openAi.service.js:101` — isZodV4 branch replaces zodResponseFormat(schema) with bare {type:'json_object'} — the enum constraint never reaches the model
- `packages/functions/src/services/openAi.service.js:100` — isZodV4 = Boolean(zodSchema?.['~standard']) — always true for the zod ^4.1.12 the repo pins, so the downgrade fires on every schema caller
- `packages/functions/src/Schema/zodGenFullBlog.js:9` — search_intent: z.enum(SEARCH_INTENT) — the 5 values in the ZodError 'values' array; enforced only after the fact
- `packages/functions/src/const/genAIBlog.js:333` — prompt tells the model to use 'Transitional', a value absent from SEARCH_INTENT — an explicit instruction to emit an invalid literal
- `packages/functions/src/controllers/genAIBlogController.js:229` — suggestedRecommentBlog.parse(JSON.parse(rawRecommentBlog)) — throw site, matches lib/controllers/genAIBlogController.js:259 in the stack
- `packages/functions/src/controllers/genAIBlogController.js:369` — catch sets ctx.status = 500 — turns a model-output schema violation into the alerted 5xx
- `packages/functions/package.json:79` — "zod": "^4.1.12" — proves the isZodV4 branch is the live path

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T04:13:00.249Z" AND timestamp<="2026-07-31T04:43:00.249Z" AND httpRequest.status>=500`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T04:13:00.249Z" AND timestamp<="2026-07-31T04:43:00.249Z" AND severity>=ERROR AND jsonPayload.tag="[genSuggested]"`
- 69 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T04:43:00Z" AND timestamp<="2026-07-31T04:43:00Z" AND severity>=ERROR AND jsonPayload.tag="[genSuggested]"`
- 32 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T00:00:00Z" AND timestamp<="2026-07-31T04:43:00Z" AND httpRequest.requestUrl:"gen-ai-suggested"`
- 314 matching entries: `(resource.labels.service_name="api") AND resource.labels.revision_name="api-00102-dok" AND timestamp>="2026-07-30T12:00:00Z"`

## Job
- analyze rounds: 1
- cost: $2.48
- branch: `fix/prod-blog-1ce20uv`
- fix commit: `6f64b0d5a566c818ec320f7c69e24b0fb3a2f74f`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/795
- tests: 213 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/const/genAIBlog.js         |  2 +-
 packages/functions/src/services/openAi.service.js | 19 ++++++++++++++++++-
 2 files changed, 19 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
