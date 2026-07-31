fingerprint: se28ls
service: api
message: [genSuggested] kakZR5lRK5kln8uTXk1E Error genSuggested SyntaxError: Unexpected end of JSON input
app: BLOG
repo: blogs
date: 2026-07-31T09:20:32.655Z
status: mr_open
attempt: 1

# BLOG · api · se28ls

**Outcome.** duplicate of 1hjewuf — MR https://gitlab.com/avada/blogs/-/merge_requests/804

**Root cause.** Duplicate of fingerprint 1hjewuf: the OpenRouter completion behind /api/gen-ai-suggested/:type comes back as a half-written or empty JSON string, and genSuggested runs bare JSON.parse on it, throwing SyntaxError and returning 500 — already fixed on master by 89eea7c1f (merged 2026-07-31T09:08:48Z), which is after every error in this alert window.

**Mechanism.** All 4 application errors in the window are the same shape: logger.error('[genSuggested]', ..., err) at packages/functions/src/controllers/genAIBlogController.js:368 wrapping a SyntaxError thrown by JSON.parse. Two call sites, distinguished by the prod stack frame: lib/controllers/genAIBlogController.js:354:61 (3 hits, 08:14:40, 08:20:41, 08:26:50) is case 'blog-post-idea-outline' at src genAIBlogController.js:337, and lib:259:67 (1 hit, 08:18:57) is case 'recommendBlogPost' at src genAIBlogController.js:229 — matching the endpoints in the request log exactly (3× POST /api/gen-ai-suggested/blog-post-idea-outline, 1× POST /api/gen-ai-suggested/recommendBlogPost, 4 of the 5 5xx in the window; the 5th is an unrelated PUT /api/article/568321507371). Every V8 message is end-of-input class ('Unexpected end of JSON input', 'Unterminated string in JSON at position 831 / 129 / 59'), not malformed-escaping class, so the payload was cut short rather than corrupted. Latency 0.95–2.40s is far under the 30s client timeout at openAi.service.js:153, so the cut is upstream. The guard that catches this now lives in getCompletion at openAi.service.js:157 (finish_reason === 'length' OR needsJsonParse && isJsonCompletionIncomplete(rawContent)) and throws CompletionTruncatedError at openAi.service.js:161, which genSuggested maps to a retryable 503 at genAIBlogController.js:369 — that code is in this worktree but was committed 08:48:16Z and merged 09:08:48Z, i.e. after the last error at 08:26:50Z, so the 500s in the window ran against the pre-fix bundle. 12 SyntaxErrors total from 08:05Z to 09:19Z; the 3 most recent (09:03:14, 09:05:42, 09:15:01) are 6 min or less past the merge, inside the deploy lag, so they do not falsify the fix.

Confidence: `high`

## Code
- `packages/functions/src/controllers/genAIBlogController.js:337` — case 'blog-post-idea-outline' — bare JSON.parse(blogPostIdeaRaw), the alerting endpoint, prod stack lib:354:61
- `packages/functions/src/controllers/genAIBlogController.js:229` — case 'recommendBlogPost' — bare JSON.parse(rawRecommentBlog), the other failing type, prod stack lib:259:67
- `packages/functions/src/controllers/genAIBlogController.js:368` — the catch that emits the exact '[genSuggested] <shopId> Error genSuggested' line in the alert
- `packages/functions/src/controllers/genAIBlogController.js:369` — shipped fix: CompletionTruncatedError now maps to 503 retryable instead of falling through to the 500 at line 374
- `packages/functions/src/services/openAi.service.js:157` — shipped fix: truncation guard widened past finish_reason==='length' to include an unparseable/empty JSON body
- `packages/functions/src/services/openAi.service.js:161` — throws CompletionTruncatedError after one retry so the partial string never reaches the caller's JSON.parse

## Evidence
- 4 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T08:05:42Z" AND timestamp<="2026-07-31T08:35:42Z" AND jsonPayload.message:"Error genSuggested SyntaxError"`
- 4 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T08:05:42Z" AND timestamp<="2026-07-31T08:35:42Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/api/gen-ai-suggested/"`
- 12 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-31T08:05:42Z" AND timestamp<="2026-07-31T09:19:00Z" AND jsonPayload.message:"Error genSuggested SyntaxError"`

## Job
- analyze rounds: 1
- cost: $1.25
- MR: https://gitlab.com/avada/blogs/-/merge_requests/804

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
