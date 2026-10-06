You are implementing a code change directly in this repository. Write the code and run the test yourself.

Task: in the Avada SEO app, make Instant Indexing report WHY Google indexing failed. Touch ONLY these files:
- packages/functions/src/services/instantIndexingService.js
- packages/functions/src/const/googleIndexing.js
- packages/functions/src/services/__tests__/instantIndexingService.test.js
- packages/assets/src/pages/InstantIndexing/InstantIndexing.js
Do not run git commands. Do not touch anything else.

Context: the previous commit already returns results.googleError = INVALID_GOOGLE_KEY_MESSAGE for a malformed key, and the FE shows resp.data.googleError in the banner. Two gaps remain:

1. BE, indexingGoogleByType: `await jwtClient.authorize()` throws for a well-shaped key with a corrupt/revoked private_key (e.g. "invalid_grant: Invalid JWT Signature."). Today the throw bubbles to the controller -> {success:false}. Catch it (and also catch a rejection from promisifiedRequest): return results {isSuccessGoogleIndexing:false, googleError: <message>} without throwing. Log with logger.warn (e.message only; never log the key or token). Message: a new exported const in const/googleIndexing.js, GOOGLE_AUTH_FAILED_MESSAGE = 'Google rejected the indexing key. It may be revoked or corrupted — create a new key for the service account and paste the full JSON file.', followed by ` (${e.message})` when present. For a promisifiedRequest rejection use `Google Indexing failed: <e.message>`.

2. BE: when the batch response body contains error parts (Google batch: multipart parts like `HTTP/1.1 403 Forbidden` + JSON `{"error":{"code":403,"message":"Permission denied. Failed to verify the URL ownership.","status":"PERMISSION_DENIED"}}`), set results.googleError from a small helper that extracts the first error message from the body and maps:
   - message contains "Failed to verify the URL ownership" -> GOOGLE_OWNERSHIP_MESSAGE = 'Google could not verify ownership. Add the service account email as an Owner of this site in Google Search Console.'
   - message contains "has not been used in project" or body contains "SERVICE_DISABLED" -> GOOGLE_API_DISABLED_MESSAGE = "Web Search Indexing API is not enabled for the service account's Google Cloud project. Enable it, wait a few minutes, then retry."
   - otherwise `Google Indexing failed: <message>`; if no message can be extracted, leave googleError unset.
   Keep existing googleResults/googleStatus/isSuccessGoogleIndexing semantics.

3. FE InstantIndexing.js, the submit handler (handleSubmitUrls): in the `else` branch of `if (resp.success)` (currently only `trackSubmit(... 'submit_failed')`), also call `addErrors([resp.error || i18n.translate('InstantIndexing.toast.bingFailed', {social: 'Google'})])`. Nothing else in the FE.

Tests (extend the existing jest file, same mocking style): authorize rejects -> googleError contains auth message, no throw, requestPromise not called; batch body with ownership 403 -> GOOGLE_OWNERSHIP_MESSAGE; body with SERVICE_DISABLED -> GOOGLE_API_DISABLED_MESSAGE; body with other error message -> 'Google Indexing failed: ...'; requestPromise rejects -> googleError set, no throw. Existing tests must keep passing.

Style: 2-space indent, single quotes, no semicolon-less code, match surrounding code. Comments only for a non-obvious why.

Done when: `npx jest --ci packages/functions/src/services/__tests__/instantIndexingService.test.js` passes from the repo root.
