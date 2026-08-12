fingerprint: h4rn6s
service: api
message: [readTemplateData] null blockLoader: failed to read template ["sections/blog.json","templates/blog.json"] Expected double-quoted property name in JSON at position 2353 (line 79 column 3)
app: BLOG
repo: blogs
date: 2026-08-12T05:33:44.968Z
status: mr_open
attempt: 1

# BLOG · api · h4rn6s

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/854

**Root cause.** readTemplateData parses Shopify theme JSON templates with bare JSON.parse after stripping only the FIRST /* */ block (non-global regex), but Shopify JSON templates are JSONC — one shop's templates/blog.json (or sections/blog.json) still contains a non-strict-JSON construct at line 79 col 3, so every /api/blockLoader load for that shop throws SyntaxError and silently drops the whole blog template map.

**Mechanism.** GET /api/blockLoader → appBlockController.blockLoader builds neededTemplates from APP_BLOCKS, and for template 'blog' calls readTemplateData(shopify, themeId, TEMPLATE_FILES.blog = ['sections/blog.json','templates/blog.json']) (packages/functions/src/controllers/appBlockController.js:66). readTemplateData fetches the file body via findNameFileArticle and runs JSON.parse(jsonContent.replace(/\/\*[\s\S]*?\*\//, '').trim()) at line 30. The replace has no /g flag and is unanchored, so it removes exactly one comment block — the Shopify auto-generated banner at the top. Parsing then dies deeper in the file: 'Expected double-quoted property name in JSON at position 2353 (line 79 column 3)'. Position 2353 (not 0/1) proves the leading banner WAS stripped and that the offending construct — a second /* */ comment, or a trailing comma, sitting at indent level 1 — survives. The catch at line 33 swallows it and returns null, so templateDataMap.blog === null, the `if (!data) continue;` at line 80 skips every blog-template block, and blockLoader answers HTTP 200 with those blocks reported active:false. All 4 occurrences carry the identical byte offset 2353, i.e. one unchanged theme file, hit repeatedly. The shop cannot be identified because line 33 passes a hardcoded `null` where logger expects the shopId.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/appBlockController.js:30` — JSON.parse on JSONC content with a non-global /\/\*[\s\S]*?\*\//  replace — strips only the first comment block, so any later comment or trailing comma throws
- `packages/functions/src/controllers/appBlockController.js:33` — the exact log line in the alert; passes a hardcoded null as shopId so the offending shop/theme is unidentifiable
- `packages/functions/src/controllers/appBlockController.js:28` — takes files.nodes[0] blindly for a 2-filename query and ignores files.userErrors, so which of sections/blog.json vs templates/blog.json was parsed is unknown
- `packages/functions/src/controllers/appBlockController.js:66` — call site that maps template 'blog' to TEMPLATE_FILES.blog and stores the null result in templateDataMap
- `packages/functions/src/const/appBlock.js:107` — TEMPLATE_FILES.blog = ['sections/blog.json','templates/blog.json'] — the exact filenames array echoed in the alert message
- `packages/functions/src/controllers/appBlockController.js:80` — `if (!data) continue;` turns the parse failure into active:false for every blog-template block instead of an error state
- `packages/functions/src/routes/api.js:49` — route registration GET /blockLoader → appBlockController.blockLoader, the request that produced each error

## Evidence
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-04T00:00:00Z" AND timestamp<="2026-08-05T00:00:00Z" AND jsonPayload.tag="[readTemplateData]"`
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-04T22:38:00Z" AND timestamp<="2026-08-04T23:10:00Z" AND httpRequest.requestUrl:"blockLoader"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-04T22:38:57.286Z" AND timestamp<="2026-08-04T23:08:57.286Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $3.81
- branch: `fix/prod-blog-h4rn6s`
- fix commit: `030e48304048032b240e8c0e452ed86f0d23f670`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/854
- tests: 360 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../src/controllers/appBlockController.js          | 49 ++++++++++++++++++++--
 1 file changed, 46 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
