fingerprint: 1ettj8o
service: api
message: [updateArticlePrimary] yvdugQ1uIcIzQ5xdf8iN <gid://shopify/Article/580200104086> resp.errors [{"message":"Internal error. Looks like something went wrong on our end.\nRequest ID: 1cb49ab8-2520-49c2-b260-5de45116e142-1788201391 (include this in support requests).","extensions":{"requestId":"1cb49ab8-
app: BLOG
repo: blogs
date: 2026-08-31T18:43:45.311Z
status: fix_disabled
attempt: 1

# BLOG · api · 1ettj8o

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify Admin GraphQL answered the articleUpdate mutation with a top-level `errors` array (INTERNAL_SERVER_ERROR), and updateArticlePrimary coerces that transport-level error into `{userErrors: resp.errors}`, so articleController.update routes it into handleRetryOnError — whose only retry branches key off `userErrors[0].field`, a property GraphQL top-level errors never carry — and the call returns the identical error with no second Shopify request, losing the merchant's save.

**Mechanism.** makeGraphQlApi returned `{errors:[{message:'Internal error… Request ID: 1cb49ab8-…-1788201391', extensions:{code:'INTERNAL_SERVER_ERROR'}}]}`. shopifyGraphQlService.js `updateArticlePrimary` logs it and returns `{userErrors: resp.errors}` (line 1253) instead of throwing — a GraphQL error object with `message`+`extensions` and no `field`. articleController.update sees `req.userErrors.length > 0`, logs `[update] … shopify userErrors` (line 649) and calls handleRetryOnError (line 658). In handleRetryOnError the first branch needs `message === 'Must reference an existing blog.'` (articlesHelper.js:177) and the second needs `['article','handle'].every(v => userErrors[0]?.field?.includes(v))` (line 192); `field` is undefined, so both are false and it falls straight to `return {userErrors}` (line 208) without issuing any Shopify call. The controller then logs `… after retry` and returns HTTP 200 `{success:false}` (line 675), and the version write is skipped by the `!req?.userErrors?.length` guard (line 695). Proof the retry never fired: within each of the 4 failed saves, all three ERROR lines carry the SAME Shopify Request ID and are ≤0.5 ms apart (18:36:32.067223 → .067706); a real second Admin GraphQL round-trip would take tens of ms and return a different Request ID.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:1253` — top-level GraphQL `resp.errors` is returned as `{userErrors: …}`, erasing the distinction between a Shopify 500 and a field-level validation error
- `packages/functions/src/controllers/articleController.js:658` — update() feeds that fake userErrors array into handleRetryOnError as if it were retryable validation output
- `packages/functions/src/helpers/articlesHelper.js:192` — the only update-path retry branch requires `userErrors[0].field` to contain 'article' and 'handle'; a GraphQL top-level error has no `field`, so it is false
- `packages/functions/src/helpers/articlesHelper.js:208` — fall-through returns the same userErrors with no second Shopify call — this is why the 'after retry' log carries the identical Request ID
- `packages/functions/src/controllers/articleController.js:675` — responds 200 {success:false}; explains requests=0 (no 5xx request log exists for this failure)
- `packages/functions/src/controllers/articleController.js:695` — version snapshot skipped when userErrors present, so the merchant's edit is lost on both Shopify and the version history

## Evidence
- 12 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-31T18:21:57.264Z" AND timestamp<="2026-08-31T18:51:57.264Z" AND severity>=ERROR`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-31T18:21:57.264Z" AND timestamp<="2026-08-31T18:51:57.264Z" AND severity>=ERROR AND "1cb49ab8-2520-49c2-b260-5de45116e142-1788201391"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-31T18:21:57.264Z" AND timestamp<="2026-08-31T18:51:57.264Z" AND severity>=ERROR AND "shopify userErrors after retry"`

## Job
- analyze rounds: 3
- cost: $3.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
