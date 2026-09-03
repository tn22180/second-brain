fingerprint: 1hnjphz
service: api
message: [getContent] articles/oU1eLddMkUdpnYAYISPu/29002825839/en/Hqbbuq1otvE5HT0I4qZh.br request to <https://storage.googleapis.com/storage/v1/b/avada-blog-app-article-content/o/articles%2FoU1eLddMkUdpnYAYISPu%2F29002825839%2Fen%2FHqbbuq1otvE5HT0I4qZh.br?alt=media> failed, reason: read ETIMEDOUT
app: BLOG
repo: blogs
date: 2026-09-02T13:56:59.975Z
status: fix_disabled
attempt: 1

# BLOG · api · 1hnjphz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A transient GCS read fault (39.5s hang then `read ETIMEDOUT`) on the previous version's content blob made getContent return null, because the `new Storage()` client at articleContent.service.js:71 is built with no timeout and no app-level retry, so PUT /api/article/29002825839 answered 200 {success:true, savedVersionId:null} after 39.89s with the version snapshot silently skipped.

**Mechanism.** 13:53:25.347Z a PUT /api/article/29002825839?locale=&primary=en enters articleController.update, which at line 627 calls getLastVersion(shop.id, id, localeField). That reaches getVersion (articleRepository.js:65) which awaits hydrate(doc.data()) at line 91; hydrate (articleContent.service.js:130) awaits getContent(doc.blobPath), which does getFile(blobPath).download() at line 103 — one GET https://storage.googleapis.com/storage/v1/b/avada-blog-app-article-content/o/articles%2FoU1eLddMkUdpnYAYISPu%2F29002825839%2Fen%2FHqbbuq1otvE5HT0I4qZh.br?alt=media issued through a `new Storage()` (line 71) built with no `retryOptions` and no `timeout`. The socket read times out 39.52s into the request: the [getContent] ERROR is stamped 13:54:04.871634Z = request start 13:53:25.347071Z + 39.52s, and that PUT's own request log shows latency 39.887696795s, ending 13:54:05.23Z. getContent's catch (line 106) logs the alerted line and returns null (line 108); hydrate turns that into {...doc, contentUnavailable: true} (line 133); update then takes the guard at articleController.js:703 and logs the second ERROR '[update] … version skipped: previous content unavailable' at 13:54:05.244092Z — 373 ms after the first, same request — instead of writing a version. Control falls to line 727, which returns {success: true, data: preparedData, savedVersionId: null}, so no 5xx exists (requests read = 0 for the window) and the editor shows a normal save. The guard at line 703 is the FAL-718 fix (commit fada850fe) and is correct — it stops an empty blob being persisted as a merchant edit — but nothing retries the read, so one transient GCS fault costs the merchant a version snapshot with no user-visible signal. The fault is transient, not deterministic: the 8 other PUTs on the same article in the same 4 minutes ran 1.57–2.23s, except one at 13:54:09.355Z that took 28.36s and completed. Same bucket, same day: 3 transport-level GCS failures total (08:12:18Z getContent 'network timeout at', 13:07:30Z createArticle/putContent 'read ETIMEDOUT' = recorded fingerprint 2kb6y1, 13:54:04Z this one) — one code path family, none of them retried.

Confidence: `high`

## Code
- `packages/functions/src/services/articleContent.service.js:71` — new Storage() built with no retryOptions and no timeout — the client that issued the timed-out download
- `packages/functions/src/services/articleContent.service.js:103` — getFile(blobPath).download() — the single unretried GCS read named in the alert URL
- `packages/functions/src/services/articleContent.service.js:106` — logger.error('[getContent]', blobPath, e.message) — emits exactly the alerted line at severity ERROR
- `packages/functions/src/services/articleContent.service.js:108` — return null — a transient transport failure is collapsed into the same 'unavailable' signal as a genuinely bad blob
- `packages/functions/src/services/articleContent.service.js:133` — hydrate marks the doc contentUnavailable when getContent returned null
- `packages/functions/src/repositories/articleRepository.js:91` — getVersion awaits hydrate(), the call path from getLastVersion to the GCS read
- `packages/functions/src/controllers/articleController.js:627` — const prevVersion = await getLastVersion(...) — the call site reached by PUT /api/article/:id
- `packages/functions/src/controllers/articleController.js:706` — logger.error('[update]', ... 'version skipped: previous content unavailable') — the second alerted ERROR, same request, 373 ms later
- `packages/functions/src/controllers/articleController.js:727` — returns {success:true, savedVersionId:null}, so the merchant's UI reports a clean save while no version was stored

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-02T13:39:11.497Z" AND timestamp<="2026-09-02T14:09:11.497Z" AND severity>=ERROR`
- 12 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-02T13:50:00Z" AND timestamp<="2026-09-02T13:56:00Z" AND httpRequest.requestUrl:"29002825839"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-02T00:00:00Z" AND timestamp<="2026-09-02T14:10:00Z" AND (jsonPayload.tag="[getContent]" OR jsonPayload.tag="[createArticle]" OR jsonPayload.tag="[putContent]" OR jsonPayload.tag="[deleteContent]")`

## Job
- analyze rounds: 1
- cost: $1.75

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
