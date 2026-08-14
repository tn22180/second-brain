fingerprint: 15hvwoe
service: api
message: [generateContent] fKUMrHXwtJca3KNWMU6X Error generating content: Bad control character in string literal in JSON at position 61 (line 3 column 13)
app: BLOG
repo: blogs
date: 2026-08-14T03:55:23.001Z
status: mr_open
attempt: 2

# BLOG · api · 15hvwoe

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/879

**Root cause.** POST /api/tools/genAi returns {success:false} because toolsYouTubeController.generateContent parses the OpenRouter completion with a bare JSON.parse, which throws "Bad control character in string literal in JSON" when the model emits a raw newline inside a JSON string value — while the repair helper safeParseJsonCompletion that the rest of the repo uses is not applied on this path.

**Mechanism.** The single log line at 2026-08-14T03:47:26.172183Z carries tag "[generateContent]" and the text "<shopId> Error generating content: <e.message>", which is emitted only by packages/functions/src/controllers/toolsYouTubeController.js:135. The only JSON.parse in that try block (and in the whole call path — getBasePromptTool, useModelAiById, getCompletion, reduceTokens contain none) is packages/functions/src/controllers/toolsYouTubeController.js:132, JSON.parse(genAiContent). genAiContent comes from useModelAiById(model, prompt, 'json_object', true) → openAi.service.getCompletion, which returns the raw (fence-stripped) string at packages/functions/src/services/openAi.service.js:201 — it never parses for the caller. getCompletion's own integrity gate at packages/functions/src/services/openAi.service.js:169 checks parseability through safeParseJsonCompletion, which repairs bare 0x0A/0x09 inside string literals (packages/functions/src/services/openrouter/safeParseJsonCompletion.js:55), so a completion carrying a raw newline passes the gate, no truncation retry fires, and the unrepaired string is handed back. The controller's strict JSON.parse then throws V8's "Bad control character in string literal in JSON at position 61 (line 3 column 13)" — position 61 / line 3 is the raw newline inside a string value, exactly the defect safeParseJsonCompletion.js:1-5 documents for google/gemini-2.5-flash, the model DEFAULT_MODEL resolves to. The catch at :135 logs and answers 200 with {success:false}, which is why the requests read (httpRequest.status>=500) is empty — 0 entries — and why round 1's 5xx query matched nothing.

Confidence: `high`

## Code
- `packages/functions/src/controllers/toolsYouTubeController.js:132` — bare JSON.parse(genAiContent) — the only JSON.parse in the handler's try block; throws the logged SyntaxError
- `packages/functions/src/controllers/toolsYouTubeController.js:135` — the exact logger.error that produced the alert text '[generateContent] <shopId> Error generating content: <message>'
- `packages/functions/src/controllers/toolsYouTubeController.js:122` — useModelAiById(model, prompt, 'json_object', true) — requests json_object, so the completion is expected to be JSON
- `packages/functions/src/services/openAi.service.js:201` — getCompletion returns the raw fence-stripped string to the caller; it never parses on the caller's behalf
- `packages/functions/src/services/openAi.service.js:169` — the integrity gate uses isJsonCompletionIncomplete → safeParseJsonCompletion, which repairs the control char, so the payload is judged complete and no retry fires
- `packages/functions/src/services/openrouter/safeParseJsonCompletion.js:50` — existing repair-then-parse helper that escapes bare 0x0A/0x09 inside string literals — not used by the controller
- `packages/functions/src/services/openrouter/safeParseJsonCompletion.js:33` — the control-character branch (code <= 0x1f) that would have made this exact payload parse

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-14T03:32:31.831Z" AND timestamp<="2026-08-14T04:02:31.831Z" AND jsonPayload.tag="[generateContent]"`
- 1 matching entries: `timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-14T04:02:31.831Z" AND jsonPayload.message:"Bad control character in string literal"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-14T03:32:31.831Z" AND timestamp<="2026-08-14T04:02:31.831Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $4.28
- branch: `fix/prod-blog-15hvwoe-a2`
- fix commit: `d6975a05da9e1e12f82fe701f0a8b780796f1b25`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/879
- tests: 366 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/toolsYouTubeController.js | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
