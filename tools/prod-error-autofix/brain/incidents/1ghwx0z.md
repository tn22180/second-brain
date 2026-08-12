fingerprint: 1ghwx0z
service: api
message: [getOne] mhlIlJNbu79LG96Gs8ls error getOne Value for argument "value" is not a valid query constraint. Cannot use "undefined" as a Firestore value. If you want to ignore undefined values, enable `ignoreUndefinedProperties`.
app: BLOG
repo: blogs
date: 2026-08-12T08:45:59.647Z
status: mr_open
attempt: 1

# BLOG · api · 1ghwx0z

**Outcome.** duplicate of 1qmdvrl — MR https://gitlab.com/avada/blogs/-/merge_requests/863

**Root cause.** Duplicate of fingerprint 1qmdvrl (MR https://gitlab.com/avada/blogs/-/merge_requests/863 open, unmerged — same request, same shop mhlIlJNbu79LG96Gs8ls, same 20:19:09Z event): GET /api/article/:id opened with no `locale` and no `primary` query param makes articleController.getOne pass `undefined` into getFirstVersion/getLastVersion, and articleRepository.getVersion feeds that undefined straight into `.where('locale','==',locale)`, which Firestore rejects.

**Mechanism.** This alert's `[getOne]` line at 20:19:09.259252Z is the catch of the same request whose two `[getVersion]` lines fired 1.1ms and 0.8ms earlier (.258156Z first version, .258435Z last version) — one request, both legs of the Promise.all at packages/functions/src/controllers/articleController.js:225-226 throwing together, then getOne's catch at :301 re-logging `e.message` verbatim. The throwing frame in the prod stack is `validateQueryValue -> Query.where -> getVersion (lib/repositories/articleRepository.js)`, i.e. the third `where` in getVersion, src line 50 `.where('locale','==',locale)` — the shopId filter has a value (logged: mhlIlJNbu79LG96Gs8ls) and the id filter is a ternary that can never yield undefined (src 44-48), so locale is the only candidate. getOne builds that argument as `locale ? locale : primary`, both destructured from `ctx.query` at src 209 with no validation. The matching request log at 20:19:08.985401Z is `GET https://api-arodugkrmq-uc.a.run.app/api/article/601812467895` with no query string at all, so both are undefined and the expression evaluates to undefined. That same request logged HTTP **200**, not 500, because getOne's catch answers `{success:false}` at 200 (src 301-306) — which is why the `requests` read (httpRequest.status>=500) came back with 0 entries; the absence is the handler's design, not an absence of the failure. The FE callers that omit the query string are the list rows: packages/assets/src/pages/Home/RecentPostTable/RowMarkup.js:103 and packages/assets/src/pages/ContentManager/PostManagement/ManageTable/RowMarkup.js:167, both `apiUrl: /article/${id}`.

Confidence: `high`

## Code
- `packages/functions/src/repositories/articleRepository.js:50` — .where('locale','==',locale) — the exact Query.where frame in the prod stack, no undefined guard
- `packages/functions/src/repositories/articleRepository.js:44` — the id filter is a ternary always yielding a string, isolating locale as the only undefined argument
- `packages/functions/src/repositories/articleRepository.js:66` — logger.error('[getVersion]', ...) — emits the two sibling lines 1ms before this alert's line
- `packages/functions/src/controllers/articleController.js:225` — getFirstVersion(shopId, id, locale ? locale : primary) — undefined when neither query param is sent
- `packages/functions/src/controllers/articleController.js:226` — getLastVersion with the same expression; both Promise.all legs throw, explaining 2 [getVersion] lines per 1 [getOne]
- `packages/functions/src/controllers/articleController.js:209` — const {locale, primary, ...} = ctx.query — both optional, neither validated
- `packages/functions/src/controllers/articleController.js:210` — shopLocales is fetched before the try block, so the real primary locale is already in hand and need not come from ctx.query
- `packages/functions/src/controllers/articleController.js:301` — logger.error('[getOne]', shopId, 'error getOne', e.message) — produces this alert's message verbatim, then answers 200
- `packages/assets/src/pages/Home/RecentPostTable/RowMarkup.js:103` — apiUrl: /article/${id} with no query string — FE caller that triggers it
- `packages/assets/src/pages/ContentManager/PostManagement/ManageTable/RowMarkup.js:167` — second query-string-less caller of the same endpoint

## Evidence
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:04:11.277Z" AND timestamp<="2026-08-06T20:34:11.277Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:19:05Z" AND timestamp<="2026-08-06T20:19:20Z" AND httpRequest.requestUrl:"/api/article/"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-01T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND jsonPayload.tag="[getOne]" AND jsonPayload.message:"not a valid query constraint"`
- 27 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:04:11.277Z" AND timestamp<="2026-08-06T20:34:11.277Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $0.75
- MR: https://gitlab.com/avada/blogs/-/merge_requests/863

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
