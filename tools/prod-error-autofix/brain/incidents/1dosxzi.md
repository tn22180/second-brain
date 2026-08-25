fingerprint: 1dosxzi
service: mcp
message: [getShopifyArticleById] IAD6Ij8qq3S7TQx2lQpA 999999999999 Error: Article not found
app: BLOG
repo: blogs
date: 2026-08-25T03:56:00.207Z
status: fix_disabled
attempt: 1

# BLOG · mcp · 1dosxzi

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Not a request failure: getShopifyArticleById logs its two expected "article does not exist" outcomes — InvalidArticleIdError for a non-numeric id and Error('Article not found') for a gid Shopify resolves to null — at logger.error (severity ERROR), so two get_article MCP calls made with the synthetic ids "abc" and "999999999999" by shop IAD6Ij8qq3S7TQx2lQpA fired the sink while both tool calls returned HTTP 200 with a clean refusal.

**Mechanism.** MCP get_article calls getShopifyArticleById({shop, id, isReadOnly: true}) at packages/functions/src/mcp/tools/getArticle.js:25. For id "abc", normalizeShopifyGid returns the string unchanged and the /^(\d+|gid:\/\/shopify\/Article\/\d+)$/ guard at shopifyGraphQlService.js:759 rejects it, so :760 throws InvalidArticleIdError before any Shopify round trip — matching the prod frame lib/services/shopifyGraphQlService.js:858 (src :760, line numbers differ, babel output). For id "999999999999" the guard passes, the article(id:) query is issued, processJSONMetafield(resp.data?.article) is falsy at :867 and :869 throws Error('Article not found') — prod frame lib/…:959 (src :869). Both land in the single catch at :889, whose logger.error at :890 emits the exact alert text '[getShopifyArticleById] IAD6Ij8qq3S7TQx2lQpA <id> <error>' at severity ERROR, and :891 returns {}. Back in getArticle.js:27 the `!article?.id` branch fires and :28 returns asRefusal(...), which toolResult.js:16-19 turns into an ordinary tool result with isError: true inside a 200 response — no throw escapes the handler. Proof the request path never failed: the requests read (httpRequest.status>=500 on mcp for the 30-min window) matched 0 entries, and every one of the 12 mcp requests logged in the 03:53:00–03:53:10Z decade around the two errors carries status 200 with 0.05–0.95s latency. The two ids are not merchant data — "abc" and "999999999999" are fabricated probes, 0.52s apart, same shop, same instance 00a41e8c1de1e27e…, and they are the ONLY two [getShopifyArticleById] lines on mcp in the whole preceding 24h. Same defect and same catch block as recorded fingerprint 7u4qve (BLOG · mcp, verdict fix_disabled) and the getPreview/list family 9m7zmo / 14ydm3m / hhp84a; this occurrence adds no new cause.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:890` — logger.error('[getShopifyArticleById]', shop?.id, id, e) — emits the exact alert line at severity ERROR for a handled, expected miss. The defect.
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throw new InvalidArticleIdError(id) — source of the 'Article id could not be resolved to a gid: "abc"' entry at 03:53:03.901828Z
- `packages/functions/src/services/shopifyGraphQlService.js:869` — throw new Error('Article not found') when processJSONMetafield(resp.data?.article) is falsy — source of the alerted 999999999999 entry at 03:53:03.384062Z
- `packages/functions/src/services/shopifyGraphQlService.js:891` — return {} instead of rethrowing — why the MCP handler sees an empty object rather than an error, and why nothing propagates to a 5xx
- `packages/functions/src/mcp/tools/getArticle.js:25` — the call site named in the stack (lib/mcp/tools/getArticle.js:57)
- `packages/functions/src/mcp/tools/getArticle.js:27` — `if (!article?.id)` — the {} from the catch is correctly detected here, so the miss is already handled
- `packages/functions/src/mcp/tools/getArticle.js:28` — asRefusal(...) — merchant-readable refusal returned instead of an error, consistent with the 200s in the request log
- `packages/functions/src/mcp/tools/toolResult.js:16` — asRefusal builds a normal tool result with isError: true — 'never a thrown error', so the MCP POST stays 200
- `packages/functions/src/services/__tests__/shopifyGraphQlService.nullArticle.test.js:58` — existing test asserts the not-found path is reported through logger.error — the assertion a log-level fix must change

## Evidence
- 2 matching entries: `(resource.labels.service_name="mcp" OR resource.labels.function_name="mcp" OR resource.labels.job_name="mcp") AND timestamp>="2026-08-25T03:38:17.782Z" AND timestamp<="2026-08-25T04:08:17.782Z" AND severity>=ERROR`
- 2 matching entries: `(resource.labels.service_name="mcp") AND timestamp>="2026-08-24T04:08:17Z" AND timestamp<="2026-08-25T04:08:17Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 12 matching entries: `(resource.labels.service_name="mcp") AND timestamp>="2026-08-25T03:53:00Z" AND timestamp<="2026-08-25T03:53:10Z" AND httpRequest.requestMethod!=""`
- 3 matching entries: `(resource.labels.service_name="mcp" OR resource.labels.function_name="mcp" OR resource.labels.job_name="mcp") AND timestamp>="2026-08-25T03:38:17.782Z" AND timestamp<="2026-08-25T04:08:17.782Z" AND logName:"stderr"`
- 2 matching entries: `(resource.labels.service_name="mcp") AND timestamp>="2026-08-25T03:50:00Z" AND timestamp<="2026-08-25T03:56:00Z" AND (labels.execution_id="84qjbhkfd5n7" OR labels.execution_id="84qisgskijwg")`

## Job
- analyze rounds: 1
- cost: $1.73

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
