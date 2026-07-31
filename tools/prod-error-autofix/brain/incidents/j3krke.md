fingerprint: j3krke
service: api
message: [genIdeas] fKUMrHXwtJca3KNWMU6X SyntaxError: Unexpected token 'T', "The provid"... is not valid JSON
app: BLOG
repo: blogs
date: 2026-07-31T09:23:57.663Z
status: mr_open
attempt: 1

# BLOG · api · j3krke

**Outcome.** duplicate of se28ls — MR https://gitlab.com/avada/blogs/-/merge_requests/804

**Root cause.** genIdeas asks OpenRouter for a free-text completion (getCompletion default format='text', no zodSchema) and then bare JSON.parse's the reply, so whenever the model answers in prose instead of JSON — which it does when it judges the knowledge base too thin — the controller throws SyntaxError and returns an empty idea list.

**Mechanism.** POST /api/gen-ai-blog/ideas → genAIBlogController.genIdeas (src/controllers/genAIBlogController.js:507) builds the prompt and calls genAIBlogService.generate(prompt, GPT_4_1_MINI, false) at :513. generate (src/services/genAIBlogService.js:36) → getAIResponse (src/services/aiService.js:25) → openAiService.getCompletion({content, model, isStream}) with no `format` and no `zodSchema`, so getCompletion (src/services/openAi.service.js:91-96) sends response_format {type:'text'} and needsJsonParse is false at :142 — the truncation/JSON-validity guard added in 89eea7c1f is skipped and the raw string is returned unchecked. genIdeas strips the markdown fence at :515 and calls JSON.parse at :516 on whatever prose came back. Prod logs show exactly that: 5 of 6 genIdeas failures in 24h begin with conversational text — "The provid"...(x3), "It looks l"..., "Since the "... — each raising `Unexpected token <X> ... is not valid JSON` at JSON.parse, caught at :523 which logs and answers 200 {success:false, data:[]}. Sibling handler genSuggested does it correctly (format:'json_object' + zodSchema, src/controllers/genAIBlogController.js:236-238), which is why only genIdeas fails this way.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genAIBlogController.js:513` — genIdeas calls generate() with no format/schema — request goes out as plain text completion
- `packages/functions/src/controllers/genAIBlogController.js:516` — bare JSON.parse on the raw completion — the throw site in the alert stack (lib line 525)
- `packages/functions/src/controllers/genAIBlogController.js:523` — catch logs '[genIdeas]' <shopId> <SyntaxError> — the exact alert line
- `packages/functions/src/services/genAIBlogService.js:36` — generate() forwards only content/model/isStream, dropping any chance to set format or zodSchema
- `packages/functions/src/services/aiService.js:25` — getAIResponse passes only {content, model, isStream} to getCompletion
- `packages/functions/src/services/openAi.service.js:95` — format defaults to 'text' → response_format {type:'text'}, nothing constrains the model to JSON
- `packages/functions/src/services/openAi.service.js:142` — needsJsonParse=false for text format, so isJsonCompletionIncomplete/retry guard never runs on this path
- `packages/functions/src/controllers/genAIBlogController.js:236` — genSuggested's correct pattern (format json_object + zodSchema) — the contrast that isolates genIdeas

## Evidence
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T09:00:00Z" AND timestamp<="2026-07-31T09:35:00Z" AND jsonPayload.tag="[genIdeas]"`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T09:00:00Z" AND timestamp<="2026-07-31T09:35:00Z" AND jsonPayload.tag="[genIdeas]" AND jsonPayload.error.message:"is not valid JSON"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T09:01:52.389Z" AND timestamp<="2026-07-31T09:31:52.389Z" AND jsonPayload.tag="[genIdeas]"`

## Job
- analyze rounds: 1
- cost: $1.28
- MR: none — the duplicate gate wrongly folded this into MR 804 (a genSuggested truncation
  fix) because both analyses ranked `genAIBlogController.js` first, at :513 and :337. Fixed
  by `PRIMARY_LINE_WINDOW`. The genIdeas defect below is unfixed and still open.

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
