fingerprint: bvrcak
service: apisa
message: [genIdeas] dc51DUJOyrxHtY7gxezD SyntaxError: Unexpected token 'T', "The knowle"... is not valid JSON
app: BLOG
repo: blogs
date: 2026-08-12T05:07:44.285Z
status: mr_open
attempt: 1

# BLOG · apisa · bvrcak

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/853

**Root cause.** genIdeas asks OpenRouter for an unconstrained free-text completion (getCompletion default format='text', no zodSchema) and then bare JSON.parse's the reply, so every time the model answers in prose instead of JSON — which it does when it judges the knowledge base too thin — the controller throws SyntaxError and returns an empty idea list.

**Mechanism.** POST /apiSa/gen-ai-blog/ideas → genAIBlogController.genIdeas (packages/functions/src/controllers/genAIBlogController.js:506) builds the prompt with getIdeasPromptFromKnowledgeBase and calls genAIBlogService.generate(prompt, GPT_4_1_MINI, false) at :511. generate (services/genAIBlogService.js:37) forwards only {content, aiModel, isStream} to getAIResponse (services/aiService.js:25), which calls openAiService.getCompletion({content, model, isStream}) — no `format`, no `zodSchema`. In getCompletion, format defaults to 'text' (services/openAi.service.js:98) so response_format is {type:'text'}, and needsJsonParse is false at :145, which means the JSON-validity / truncation guard at :169 never runs on this path and the raw string is returned unchecked. The prompt only asks for JSON in words (services/aiPrompts/ideasBlog.js:26 'Return ONLY valid JSON'), so nothing enforces it. genIdeas strips the markdown fence at :513 and JSON.parse's at :514 — the throw site the alert stack names as lib/controllers/genAIBlogController.js:532. Prod bears this out: all 32 [genIdeas] log lines in 8 days (2026-07-28→08-05) are SyntaxError, and every one starts with a conversational refusal/disclaimer, not JSON — "The knowle"… , "The provid"… , "Since the "… , "Since no B"… , "Given that"… . The alert line at 17:37:11.744089Z (shop dc51DUJOyrxHtY7gxezD, apisa) is that same shape; the catch at :521 logs it and answers 200 {success:false, data:[]}. Sibling handler genSuggested does it right (format:'json_object' + zodSchema, genAIBlogController.js:236-238), which is why only genIdeas fails this way. The 16 UNAUTHENTICATED lines in the same window are a separate, unrelated eventLogService cold-credential issue (P6), 3 minutes after the alert and on a different execution_id.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genAIBlogController.js:511` — genIdeas calls generate() with no format and no zodSchema — request leaves as a plain text completion
- `packages/functions/src/controllers/genAIBlogController.js:514` — bare JSON.parse on the raw completion — the throw site in the alert stack (lib line 532)
- `packages/functions/src/controllers/genAIBlogController.js:521` — catch logs '[genIdeas]' <shopId> <SyntaxError> — the exact alert line
- `packages/functions/src/controllers/genAIBlogController.js:236` — genSuggested's correct pattern (format json_object + zodSchema) — the contrast that isolates genIdeas
- `packages/functions/src/services/genAIBlogService.js:37` — generate() forwards only content/aiModel/isStream, dropping any chance to set format or zodSchema
- `packages/functions/src/services/aiService.js:25` — getAIResponse passes only {content, model, isStream} to getCompletion
- `packages/functions/src/services/openAi.service.js:98` — format defaults to 'text' → response_format {type:'text'}, nothing constrains the model to JSON
- `packages/functions/src/services/openAi.service.js:145` — needsJsonParse=false for text format, so the isJsonCompletionIncomplete/retry guard at :169 never runs on this path
- `packages/functions/src/services/aiPrompts/ideasBlog.js:26` — 'Return ONLY valid JSON' is prompt-only instruction with no response_format backing it

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-04T17:22:13.406Z" AND timestamp<="2026-08-04T17:52:13.406Z" AND jsonPayload.tag="[genIdeas]"`
- 32 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api" OR resource.labels.service_name="apiv2") AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-05T00:00:00Z" AND jsonPayload.tag="[genIdeas]"`
- 32 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api" OR resource.labels.service_name="apiv2") AND timestamp>="2026-07-28T00:00:00Z" AND timestamp<="2026-08-05T00:00:00Z" AND jsonPayload.tag="[genIdeas]" AND jsonPayload.error.name="SyntaxError"`

## Job
- analyze rounds: 1
- cost: $3.55
- branch: `fix/prod-blog-bvrcak`
- fix commit: `dbdf3b4ce38b96ecf61ee0b0a6a0647049acaf90`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/853
- tests: 360 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/Schema/zodGenFullBlog.js    | 12 ++++++++++
 .../src/controllers/genAIBlogController.js         | 13 +++++++----
 packages/functions/src/services/aiService.js       | 27 +++++++++++++++++++---
 .../functions/src/services/genAIBlogService.js     |  6 +++--
 4 files changed, 49 insertions(+), 9 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
