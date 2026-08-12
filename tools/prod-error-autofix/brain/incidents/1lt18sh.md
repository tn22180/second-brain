fingerprint: 1lt18sh
service: api
message: [getVersion] mhlIlJNbu79LG96Gs8ls Error fetching first version Error: Value for argument "value" is not a valid query constraint. Cannot use "undefined" as a Firestore value. If you want to ignore undefined values, enable `ignoreUndefinedProperties`.
app: BLOG
repo: blogs
date: 2026-08-12T08:47:17.153Z
status: mr_open
attempt: 1

# BLOG · api · 1lt18sh

**Outcome.** duplicate of 1ghwx0z — MR https://gitlab.com/avada/blogs/-/merge_requests/863

**Root cause.** Duplicate of fingerprint 1qmdvrl (MR https://gitlab.com/avada/blogs/-/merge_requests/863 open, unmerged): the same single request GET /api/article/601812467895 at 2026-08-06T20:19:08.985401Z carried no query string, so articleController.getOne passed `undefined` as the locale into getFirstVersion/getLastVersion and articleRepository.getVersion put that undefined into `.where('locale','==',locale)`, which Firestore rejects.

**Mechanism.** getOne destructures `locale` and `primary` off ctx.query (articleController.js:209) and builds the version-lookup argument as `locale ? locale : primary` (lines 225-226). The matching request log — the only /api/article/ entry in the whole window, at 20:19:08.985401Z — is `GET https://api-arodugkrmq-uc.a.run.app/api/article/601812467895` with no query string at all, so both params are undefined and the expression evaluates to undefined. getVersion then calls `.where('locale','==',undefined)` (articleRepository.js:50); the other two filters cannot be the offender because shopId has a logged value (mhlIlJNbu79LG96Gs8ls) and the id filter is a ternary that always yields a string (line 44). Both Promise.all legs throw together, which is why one request emits two [getVersion] lines at .258156Z (first) and .258435Z (last) plus one [getOne] line at .259252Z — exactly the 3 errors in the window. getOne's catch answers HTTP 200 with `{success:false}` (line 301), which is why the requests read (status>=500) is empty and the request log above shows 200. Callers that omit the query string are the FE list rows: packages/assets/src/pages/Home/RecentPostTable/RowMarkup.js:103 and packages/assets/src/pages/ContentManager/PostManagement/ManageTable/RowMarkup.js:167.

Confidence: `high`

## Code
- `packages/functions/src/repositories/articleRepository.js:50` — `.where('locale','==',locale)` — the Query.where frame in the prod stack; no undefined guard
- `packages/functions/src/repositories/articleRepository.js:44` — the id filter is a ternary that always yields a string, isolating locale as the only undefined argument
- `packages/functions/src/repositories/articleRepository.js:66` — logger.error('[getVersion]', shopId, `Error fetching ${order === 'desc' ? 'last' : 'first'} version`) — emits both alert lines verbatim
- `packages/functions/src/controllers/articleController.js:209` — `const {locale, primary, ...} = ctx.query` — both optional, neither validated
- `packages/functions/src/controllers/articleController.js:225` — getFirstVersion(shopId, id, locale ? locale : primary) — undefined when neither query param is sent
- `packages/functions/src/controllers/articleController.js:226` — getLastVersion with the same expression; both Promise.all legs throw, explaining 2 [getVersion] lines per request
- `packages/functions/src/controllers/articleController.js:301` — catch logs [getOne] and returns HTTP 200 with success:false — why no 5xx request log exists
- `packages/assets/src/pages/Home/RecentPostTable/RowMarkup.js:103` — `apiUrl: /article/${id}` with no query string — FE caller that triggers it
- `packages/assets/src/pages/ContentManager/PostManagement/ManageTable/RowMarkup.js:167` — second query-string-less caller of the same endpoint

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:04:11.400Z" AND timestamp<="2026-08-06T20:34:11.400Z" AND jsonPayload.tag="[getVersion]"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:04:11.400Z" AND timestamp<="2026-08-06T20:34:11.400Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-06T20:19:05Z" AND timestamp<="2026-08-06T20:19:20Z" AND httpRequest.requestUrl:"/api/article/"`

## Job
- analyze rounds: 1
- cost: $0.78
- MR: https://gitlab.com/avada/blogs/-/merge_requests/863

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
