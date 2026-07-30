## Why

Triage of 11 production 5xx endpoints on `avada-blog-app` (see `jobs/bugprod.md`). Before the real
root causes can be ranked, several of these endpoints had to be made observable at all: two of them
left no server-side trace, and two reported failures with a status code that misrepresented what
happened. This MR fixes that layer plus one hard capacity ceiling. It deliberately does **not**
guess at the AI-upstream failures — those need the log pass.

All code below was written against `master` (`aad0e1df7`).

## What changed

**`tag.controller.js` — the silent 500s**

All four catch blocks logged nothing. `listStorefront` and `getPostsByTag` back `/proxy/tags` and
`/proxy/posts-by-tag`, both of which appear in the production error list, and both were impossible
to diagnose: the file contained zero references to `logger`, so the only party who ever saw the
error was the shopper, via the raw `e.message` in the response body.

- All four now log with shop context.
- The two storefront handlers answer `Failed to load tags` / `Failed to load posts` instead of
  echoing internal error text to the storefront.
- The two admin handlers keep their existing body and just gain a log.

**`articleController.update` — unattributed 500, and an unusable error payload**

`getShopById` and `initShopify` ran *before* the `try`, so a missing shop produced a 500 with no
`articleId` attribution and no `[update]` log line.

- Whole body moved inside the `try`; `shop` is hoisted only so the catch can still log it.
- The catch still answers **200** with `{success: false}` — deliberately. The admin UI reads the
  `success` flag, and switching to 500 would move `usePutApi` onto its throw path (the embedded
  `api` helper throws on `!response.ok`, `packages/assets/src/helpers.js:104-107`), changing which
  toast the merchant sees. Only the payload is fixed: it returned the bare `Error`, which
  serialises to `{}`, and now returns `error.message`.

No behaviour change on the response contract for this endpoint.

**`langGraphController.generate` — bare TypeError, and an invisible catch-all**

The handler dereferences `shop.id` immediately after loading it, so a missing shop threw
`Cannot read properties of null (reading 'id')` and surfaced as an unexplained 500. Separately,
once the SSE headers are written the response is already `200`, so every later failure could only
be reported through the stream and left nothing server-side at all.

- Missing shop now answers `404 Shop not found`.
- The catch-all logs before writing the SSE `error` event.

Note for whoever picks up the log pass: because of that `ctx.status = 200`, an HTTP **500** on this
endpoint can only have originated in the pre-stream section, which is uncaught and therefore does
reach `createErrorHandler` and does log `[unhandledError]`.

**`genImageAIController.get` — empty list reported as a server error**

`if (isEmpty(result))` returned `500 No images found`. A shop that has generated no images is an
empty list. The bogus 5xx inflated this endpoint's error rate, which matters because the same
endpoint also shows a genuine 504 in the production list.

**`functions/http.js` — proxy instance ceiling**

```
- {memory: '512MiB', cpu: 1, timeoutSeconds: 60, maxInstances: 1,  concurrency: 80}
+ {memory: '512MiB', cpu: 1, timeoutSeconds: 60, maxInstances: 10, concurrency: 80}
```

`proxy` serves storefront traffic for every shop on one vCPU, and was the only function in the file
capped at a single instance (`api` has 100, `apiv2` 10, `apiSa` 5). Raised to 10 to match `apiv2`.
`minInstances` is unset, so idle cost does not change.

## Tests

Two new suites, 6 tests:

- `tag.controller.storefrontErrors.test.js` — storefront failures are logged with the domain and the
  body stays generic; the success path logs nothing.
- `genImageAIController.emptyList.test.js` — empty list is `200` with the result passed through
  unchanged; a real lookup failure is still `500` and still logged.

`jest --ci`: **164 passed**. Three suites fail to *run*, identically on untouched `master` —
`checkHeadersForReauthorization`, `parseHtmlToEditor.imageRoundtrip` (module resolution) and
`removeRecipeMetafields` (missing `~/.openclaw/firebase-sa.json`). Pre-existing, unrelated.

`eslint` could not be run: it crashes in this repo's `node_modules` on Node v22 before reading any
file, and does so on untouched `master` too. Changed files were parse-checked with the repo's own
babel instead — 5/5 clean.

No dependency changes, so no `yarn.lock` update.

## Deploy note

This touches `packages/functions/src/functions/http.js`, which is on
`detect-changed-functions.js`'s force-all list — a `[deploy-changed]` deploy will fall back to
deploying all functions. The `maxInstances` change only takes effect once `proxy` is redeployed.

## Not addressed here

The four `/gen-ai-suggested/*` 500s, the `/proxy/seoOn-preview` 500, the
`/api/audit-agent/fix-issue` 500 and the `/api/get-list-ai-image` 504 still need the log pass.
The 504 in particular is a Firebase Hosting-layer timeout (Hosting caps a rewrite at 60s;
`api` itself is configured at 540s), so it will not be fixed by touching function timeouts.
