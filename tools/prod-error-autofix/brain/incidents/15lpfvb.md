fingerprint: 15lpfvb
service: apigen2
message: HTTP 500 POST /api/aiChat/metaTags
app: SEO
repo: seo
date: 2026-07-31T15:11:13.623Z
status: mr_open
attempt: 1

# SEO · apigen2 · 15lpfvb

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2093

**Root cause.** OpenRouter aborted generation mid-output (finish_reason=error) for google/gemini-2.5-flash-lite on the meta_tags call, and getMetaTags JSON.parses the 149-char truncated string with no guard, so POST /api/aiChat/metaTags returned 500.

**Mechanism.** getMetaSuggestion routes type='metaTags' to getMetaTags (aiChatController.js:73) -> getCompletion returns raw text with finishReason='error' (logged '[openAI:getCompletion] non-stop finish google/gemini-2.5-flash-lite finishReason=error len=149' at 14:45:38.423365Z). getCompletion only logs that condition and still returns the partial string (services/openAI/index.js:161-175, errorRef is null here because getMetaTags passes none). getMetaTags calls bare JSON.parse on it (services/openAI/index.js:244) -> 'SyntaxError: Unterminated string in JSON at position 149' at 14:45:38.424023Z, stack 'at getMetaTags (/workspace/lib/services/openAI/index.js:226:17) at async getMetaSuggestion (/workspace/lib/controllers/aiChatController.js:79:20)'. The controller catch then blows up on its own: shopID is declared with const inside the try block (aiChatController.js:55) but referenced in the catch logger (aiChatController.js:91), so the catch throws 'ReferenceError: shopID is not defined' at 14:45:38.424490Z before ctx.throw(500, error.message) runs — the 500 body and the Slack alert therefore carry the scope bug's message, not the JSON parse cause. Note credits were already burned: '[reduceCredits] Yz5SZlJbKHuViyCn3DUF with action: metaTags and amount: 5' at 14:45:29.771906Z, same execution_id 9219d9nilogd, because reduceCredits runs in the same Promise.all as the handler (aiChatController.js:82-86).

Confidence: `high`

## Code
- `packages/functions/src/services/openAI/index.js:244` — bare JSON.parse(resp) on a completion that may be truncated — the throw site in the prod stack (lib/services/openAI/index.js:226:17)
- `packages/functions/src/services/openAI/index.js:161` — non-'stop' finishReason is detected but only logged; the partial string is still returned to the caller (no retry, no throw)
- `packages/functions/src/controllers/aiChatController.js:55` — const shopID declared inside the try block — block-scoped, invisible to the catch
- `packages/functions/src/controllers/aiChatController.js:91` — catch logs with shopID -> ReferenceError masks the real SyntaxError and produces the opaque 500
- `packages/functions/src/controllers/aiChatController.js:73` — metaTags branch that dispatches to getMetaTags
- `packages/functions/src/routes/api.js:393` — route registration POST /aiChat/:type -> getMetaSuggestion

## Evidence
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-07-31T14:45:00Z" AND timestamp<="2026-07-31T14:46:00Z" AND logName:"stderr" AND textPayload:"[openAI:getMetaTags]"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-07-31T14:45:00Z" AND timestamp<="2026-07-31T14:46:00Z" AND logName:"stderr" AND textPayload:"non-stop finish"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-07-31T14:45:00Z" AND timestamp<="2026-07-31T14:46:00Z" AND logName:"stderr" AND textPayload:"aiChatController.js:92"`
- 15 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-07-30T15:00:00Z" AND timestamp<="2026-07-31T15:00:40Z" AND logName:"stderr" AND textPayload:"non-stop finish"`
- 1 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-07-31T14:30:39.594Z" AND timestamp<="2026-07-31T15:00:39.594Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $3.57
- branch: `fix/prod-seo-15lpfvb`
- fix commit: `f701da7b072a0e009d9f08a54afc2f5f2880d3ac`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2093
- tests: 774 tests, 9 failing · baseline 9 failing · reproduce test fails without the fix (suite load)

```
.../functions/src/controllers/aiChatController.js  | 11 ++--
 packages/functions/src/services/openAI/index.js    | 70 +++++++++++++++++++---
 2 files changed, 66 insertions(+), 15 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
