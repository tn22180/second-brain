fingerprint: 1qmdvrl
service: api
message: [getVersion] mhlIlJNbu79LG96Gs8ls Error fetching last version Error: Value for argument "value" is not a valid query constraint. Cannot use "undefined" as a Firestore value. If you want to ignore undefined values, enable `ignoreUndefinedProperties`.
app: BLOG
repo: blogs
date: 2026-08-12T08:44:33.962Z
status: mr_open
attempt: 1

# BLOG · api · 1qmdvrl

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/863

**Root cause.** GET /api/article/:id opened without a `locale` or `primary` query param makes articleController.getOne pass `undefined` as the locale into getFirstVersion/getLastVersion, and articleRepository.getVersion puts that undefined straight into `.where('locale','==',locale)`, which Firestore rejects.

**Mechanism.** The prod stack in the 20:19:09.258Z entry is exactly `Query.where -> getVersion (lib/repositories/articleRepository.js) -> getLastVersion -> getOne (lib/controllers/articleController.js)`, so the throwing `where` is the third one in getVersion (src line 50, `.where('locale','==',locale)`) — the shopId filter has a value (`mhlIlJNbu79LG96Gs8ls`, logged) and the id filter is a ternary that can never be undefined (src lines 44-48). getOne builds that argument as `locale ? locale : primary` (src lines 225-226) from `ctx.query`. The matching request log at 20:19:08.985401Z is `GET https://api-arodugkrmq-uc.a.run.app/api/article/601812467895` with no query string at all, so both `locale` and `primary` are undefined and the expression evaluates to undefined. Both Promise.all legs throw together, which is why one request emits two [getVersion] lines (first+last version) at 20:19:09.258156Z and .258435Z plus one [getOne] line at .259252Z. getOne's catch answers `{success:false}` at HTTP 200 (src lines 300-306), which is why the requests read (httpRequest.status>=500) is empty — that is the reason the round-1 evidence query matched nothing, not an absence of the failure. The callers that omit the query string are the FE list rows: packages/assets/src/pages/Home/RecentPostTable/RowMarkup.js:103 and packages/assets/src/pages/ContentManager/PostManagement/ManageTable/RowMarkup.js:167, both `apiUrl: /article/${id}`; every call site that does pass ?locale= (AutoTranslateBtn, LanguagePickerPopover, RevertOriginBtn) is unaffected.

Confidence: `high`

## Code
- `packages/functions/src/repositories/articleRepository.js:50` — `.where('locale','==',locale)` — the exact Query.where frame in the prod stack; no undefined guard
- `packages/functions/src/repositories/articleRepository.js:66` — logger.error('[getVersion]', shopId, `Error fetching ${order === 'desc' ? 'last' : 'first'} version`) — produces both alert lines verbatim
- `packages/functions/src/repositories/articleRepository.js:44` — the id filter is a ternary always yielding a string, so `id` cannot be the undefined argument — isolates locale as the only candidate
- `packages/functions/src/controllers/articleController.js:225` — getFirstVersion(shopId, id, locale ? locale : primary) — undefined when neither query param is sent
- `packages/functions/src/controllers/articleController.js:226` — getLastVersion with the same expression; both legs of the Promise.all throw, explaining 2 [getVersion] lines per request
- `packages/functions/src/controllers/articleController.js:209` — `const {locale, primary, ...} = ctx.query` — both are plain optional query params, neither is validated
- `packages/functions/src/controllers/articleController.js:210` — shopLocales is already fetched before the try block, so the real primary locale is in hand and does not need to come from ctx.query
- `packages/functions/src/controllers/articleController.js:301` — catch logs [getOne] and returns 200 with success:false — why no 5xx request log exists for this failure
- `packages/assets/src/pages/Home/RecentPostTable/RowMarkup.js:103` — `apiUrl: /article/${id}` with no query string — the FE caller that triggers it
- `packages/assets/src/pages/ContentManager/PostManagement/ManageTable/RowMarkup.js:167` — second query-string-less caller of the same endpoint

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:04:11.236Z" AND timestamp<="2026-08-06T20:34:11.236Z" AND jsonPayload.tag="[getVersion]"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:04:11.236Z" AND timestamp<="2026-08-06T20:34:11.236Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:19:05Z" AND timestamp<="2026-08-06T20:19:20Z" AND httpRequest.requestUrl:"/api/article/"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND jsonPayload.tag="[getVersion]"`

## Job
- analyze rounds: 2
- cost: $3.60
- branch: `fix/prod-blog-1qmdvrl`
- fix commit: `1d3b5807a27aec0e2a934cca8700e2d628f7e336`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/863
- tests: 360 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../functions/src/controllers/articleController.js |  5 +++--
 .../src/repositories/articleRepository.js          | 22 +++++++++++++---------
 2 files changed, 16 insertions(+), 11 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
