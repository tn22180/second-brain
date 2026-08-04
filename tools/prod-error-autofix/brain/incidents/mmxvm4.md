fingerprint: mmxvm4
service: api
message: [fetchHtmlContent] null Error fetching html content request to <https://fabzonefabindia.com/blogs/news/unleash-your-potential-stylish-functional-tennis-wear-for-every-player> failed, reason:  
app: BLOG
repo: blogs
date: 2026-08-04T07:26:50.100Z
status: mr_open
attempt: 1

# BLOG · api · mmxvm4

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/836

**Root cause.** One articleController.list call for shop fabzonefabindia.com fanned out 5 concurrent node-fetch GETs to that shop's custom storefront domain and all 5 failed at the socket layer inside 4.7ms, and fetchHtmlContent logged only `e.message` — so the node-fetch v2 FetchError text `request to <url> failed, reason: ` came out with an empty reason and the alert carries no identifiable network cause.

**Mechanism.** articleController.list wraps every article of the page in Promise.all (articleController.js:701) and calls getSeoAnalysisPage with `https://${getDomain(shop)}/blogs/<blog>/<handle>` (articleController.js:721). getDomain returns shop.domain first (helpers/shop/getDomain.js:11), so the target is the merchant's custom domain fabzonefabindia.com, not *.myshopify.com. seoService.getSeoAnalysisPage calls fetchHtmlContent (seoService.js:189), which does a bare `await fetch(url)` with node-fetch v2.6.7, no timeout, no agent, no User-Agent (articleController.js:111). node-fetch v2 rejects socket-level failures as `new FetchError('request to ' + url + ' failed, reason: ' + err.message, 'system', err)`; the logged text ends at `reason: ` with nothing after it, so the wrapped `err.message` was the empty string. fetchHtmlContent's catch passes `e.message` — a string, not the Error (articleController.js:118) — so logger.js:57 never finds an Error instance and never emits `error.code`/`error.stack`; the GCP entry for these 5 lines is jsonPayload {message, tag} only, no `error` object. The concrete cause candidate for an empty `err.message` on Node 22 (packages/functions/package.json engines.node=22) is the AggregateError that `net.connect` autoSelectFamily (default on since Node 20) raises when every A/AAAA candidate fails — its `.message` is '' and the real ECONNREFUSED/ETIMEDOUT entries live in `.errors`, which this code path throws away. That candidate is NOT proven by these logs and cannot be, which is the defect. fetchHtmlContent then returns '' (articleController.js:122), cheerio loads empty HTML, list answers 200 with degraded seoAnalysisPage — consistent with requests>=500 matching 0 in this window; the merchant silently sees h1=0/title=0 on 5 articles.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/articleController.js:111` — bare `await fetch(url)` — node-fetch v2, no timeout, no agent, no UA; this is the call that rejected
- `packages/functions/src/controllers/articleController.js:118` — logs `e.message` instead of the Error, so e.code/e.errno/e.cause/e.errors are discarded — the reason the alert text is empty
- `packages/functions/src/controllers/articleController.js:122` — returns '' on failure, so the caller cannot distinguish a dead fetch from an empty page; no 500 is raised
- `packages/functions/src/controllers/articleController.js:701` — Promise.all over every article on the page — explains 5 identical errors inside 4.7ms for one shop
- `packages/functions/src/controllers/articleController.js:721` — the getSeoAnalysisPage call whose url is built from getDomain(shop), i.e. the merchant custom domain
- `packages/functions/src/services/seoService.js:189` — getSeoAnalysisPage -> fetchHtmlContent, the link between the list handler and the failing fetch
- `packages/functions/src/helpers/shop/getDomain.js:11` — shop.domain wins over shopifyDomain, so the fetch targets fabzonefabindia.com rather than the always-resolvable myshopify.com host
- `packages/functions/src/helpers/logger.js:57` — logger only lifts error.name/message/stack/code when an Error instance is among the args; a pre-stringified e.message never populates it
- `packages/functions/src/controllers/articleController.js:26` — node-fetch import; package.json pins ^2.6.7, whose FetchError builds the 'request to X failed, reason: <err.message>' string

## Evidence
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-04T06:44:38.356Z" AND timestamp<="2026-08-04T07:14:38.356Z" AND jsonPayload.tag="[fetchHtmlContent]"`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-03T07:14:38Z" AND timestamp<="2026-08-04T07:14:38Z" AND jsonPayload.tag="[fetchHtmlContent]"`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-04T06:44:38.356Z" AND timestamp<="2026-08-04T07:14:38.356Z" AND jsonPayload.message:"failed, reason:  "`

## Job
- analyze rounds: 3
- cost: $5.13
- branch: `fix/prod-blog-mmxvm4`
- fix commit: `e4b501ca86ac846af16235b97e96a7dcf0c67b33`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/836
- tests: 288 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../functions/src/controllers/articleController.js  | 21 ++++++++++++++++++---
 packages/functions/src/services/seoService.js       | 11 +++++++++++
 2 files changed, 29 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
