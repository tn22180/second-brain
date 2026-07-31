fingerprint: 1ce20uv
service: api
message: HTTP 500 POST /api/gen-ai-suggested/recommendBlogPost
app: BLOG
repo: blogs
date: 2026-07-30T14:37:14.552Z
status: inconclusive
attempt: 1

# BLOG · api · 1ce20uv

**Outcome.** smoke gate jest_failed

**Root cause.** getCompletion's truncation guard only retries when OpenRouter reports finish_reason === 'length'; the gpt-4.1 alias resolves to google/gemini-2.5-flash-lite, whose truncated responses come back with a different finish_reason, so the half-written JSON string is returned unvalidated and every genSuggested JSON.parse throws SyntaxError → HTTP 500.

**Mechanism.** All 4 of the 500s in the window are /api/gen-ai-suggested/* and each pairs exactly with a [genSuggested] SyntaxError at request-start + latency (12:11:34.089+2.407s=12:11:36.497; 12:06:53.513+6.545s=12:07:00.059; 12:03:07.796+4.693s=12:03:12.490; 12:02:50.982+3.739s=12:02:54.721). All four errors are truncation-shaped ('Unterminated string in JSON at position 291/358/1191/2017'), i.e. the document ends inside a string — V8 reports a raw control char differently ('Bad control character in string literal'), so this is a cut-off document, not bad escaping. Prod is running master code newer than tag v1.84.33: the payloads carry the structured logger (jsonPayload.severity/tag/error from commit 8cacca7fb, 2026-07-30 04:46:33Z), and v1.84.33 (2026-07-28) has no such logger. 4b54f507b, which added the finish_reason retry, is an ancestor of 8cacca7fb, so the guard is deployed too. Yet zero '[getCompletion] ... output truncated (finish_reason=length)' warns exist in the window, while WARNING-severity entries are ingested in that same window (2 matched) — so the guard's warn path is visible and simply never fired. Chain: openAi.service.js:117 breaks out of the retry loop for any finish_reason other than 'length' → line 137-140 returns the truncated rawContent → genAIBlogController.js:229 (recommendBlogPost, 3 of 4) and 307-309 (suggested-outline, 1 of 4) call JSON.parse on it → throw → catch at line 367 sets ctx.status = 500. The model is Gemini 2.5 Flash Lite via LEGACY_MODEL_MAP → DEFAULT_TEXT_MODEL (const/aiModels.js:19), whose native MAX_TOKENS stop reason is not surfaced as OpenRouter finish_reason 'length'.

Confidence: `medium`

## Code
- `packages/functions/src/services/openAi.service.js:117` — `if (finishReason !== 'length') break;` — the only truncation test; any other stop reason exits the retry loop
- `packages/functions/src/services/openAi.service.js:137` — raw model content returned with no parse validation, so a truncated document reaches every JSON caller
- `packages/functions/src/const/aiModels.js:19` — DEFAULT_TEXT_MODEL = OPENROUTER_GEMINI_2_5_FLASH_LITE — what 'gpt-4.1' actually resolves to for these calls
- `packages/functions/src/controllers/genAIBlogController.js:229` — recommendBlogPost JSON.parse(rawRecommentBlog) — the throw site for 3 of the 4 500s
- `packages/functions/src/controllers/genAIBlogController.js:309` — suggested-outline JSON.parse(suggestedOutlineRaw) — the throw site for the 4th 500
- `packages/functions/src/controllers/genAIBlogController.js:368` — catch logs '[genSuggested] ... Error genSuggested' and sets status 500 — matches the alert message

## Evidence
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T11:47:56.422Z" AND timestamp<="2026-07-30T12:17:56.422Z" AND severity>=ERROR AND jsonPayload.tag="[genSuggested]" AND jsonPayload.error.name="SyntaxError"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T11:47:56.422Z" AND timestamp<="2026-07-30T12:17:56.422Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T11:47:56.422Z" AND timestamp<="2026-07-30T12:17:56.422Z" AND severity=WARNING`

## Job
- analyze rounds: 2
- cost: $4.43
- tests: jest did not run · baseline 3 failing · reproduce check did not pass

```
.../__tests__/getCompletion.truncation.test.js     | 31 ++++++++++++++++++++
 packages/functions/src/services/openAi.service.js  | 34 +++++++++++++++++-----
 2 files changed, 57 insertions(+), 8 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
