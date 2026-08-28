fingerprint: 1q1pmhv
service: api
message: [list] Ek2Vc1WNepVP6HBXxLMx Error in list: Error fetching articles: 9 FAILED_PRECONDITION: The query requires an index. You can create it here: <https://console.firebase.google.com/v1/r/project/avada-blog-app/firestore/indexes?create_composite=ClRwcm9qZWN0cy9hdmFkYS1ibG9nLWFwcC9kYXRhYmFzZXMvKGRlZmF1
app: BLOG
repo: blogs
date: 2026-08-28T02:48:31.292Z
status: fix_disabled
attempt: 2

# BLOG · api · 1q1pmhv

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getTrashArticles always appends `where('deletedAt','>=',expiryDaysAgo)` and then `orderBy(sortKey)`, so the Trash tab sorted by title needs a composite index on trashArticles (shopId ASC, deletedAt DESC, title DESC) that does not exist in firestore.indexes.json — only shopId+title and shopId+deletedAt two-field indexes are declared — and Firestore rejects every such request with 9 FAILED_PRECONDITION.

**Mechanism.** GET /api/articles?status=trash routes to articleController.list (packages/functions/src/controllers/articleController.js:782) → getTrashArticles. The repository unconditionally adds the retention filter `deletedAt >= now - trashExpiryDays` (trashArticleRepository.js:98) on top of the shopId equality (:69), and when the request carries searchKey it also adds the prefix range `title >= searchKey` / `title <= searchKey+\uf8ff` (:77-78); it then applies orderBy on the mapped sort key (:100). That query has two range fields (deletedAt, title) plus an equality, so Firestore demands index shopId ASC / deletedAt DESC / title DESC / __name__ DESC — exactly what the create_composite blob in the alert decodes to (`shopId`\x10\x01 `deletedAt`\x10\x02 `title`\x10\x02 `__name__`\x10\x02). firestore.indexes.json declares for trashArticles only shopId+title DESC (:238), shopId+title ASC (:252), shopId+deletedAt ASC (:266), shopId+deletedAt DESC (:280) and tags+shopId+deletedAt (:294) — none of them can serve it, so the driver throws, getTrashArticles rewraps it as `Error fetching articles: ...` (:121) and list's catch logs it and answers {success:false} (articleController.js:829). The repo's own cost doc already flagged this: 'trashArticleRepository.js:98 luôn thêm deletedAt >= ⇒ index này không đủ, đã stale' (docs/cost-roadmap-under-100.md:499).

Confidence: `high`

## Code
- `packages/functions/src/repositories/trashArticleRepository.js:98` — unconditional `deletedAt >=` range filter added to every trash listing, so the shopId+title indexes can never serve it
- `packages/functions/src/repositories/trashArticleRepository.js:100` — orderBy(firestoreSortKey) — with order='TITLE ...' this forces the shopId/deletedAt/title composite Firestore asks for
- `packages/functions/src/repositories/trashArticleRepository.js:77` — searchKey adds a second range field (title >= / <=), producing the 'range and inequality filters on multiple fields' note in the alert
- `packages/functions/src/repositories/trashArticleRepository.js:121` — catch rewraps the driver error as `Error fetching articles: ${e.message}` — the exact prefix in the logged message
- `firestore.indexes.json:238` — declared trashArticles index is shopId+title DESC only; no deletedAt field, so it is stale for every query this repository builds
- `firestore.indexes.json:280` — the other declared index is shopId+deletedAt DESC with no title field; neither declared index covers shopId+deletedAt+title
- `packages/functions/src/controllers/articleController.js:782` — list() dispatches status==='trash' into getTrashArticles with raw ctx.query (searchKey/order pass straight through)
- `packages/functions/src/controllers/articleController.js:829` — the `[list] <shopId> Error in list:` line that fired 7× in the window

## Evidence
- 7 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-27T01:08:26.261Z" AND timestamp<="2026-08-27T01:38:26.261Z" AND jsonPayload.message:"FAILED_PRECONDITION"`
- 7 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-27T01:08:26.261Z" AND timestamp<="2026-08-27T01:38:26.261Z" AND jsonPayload.message:"Error fetching articles"`

## Job
- analyze rounds: 2
- cost: $2.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
