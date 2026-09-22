fingerprint: 1n1zitj
service: api
message: [handleError] nrkjbmKkyf9JkdTeYH74 undefined Error: Element at index 0 is not a valid field path. Paths can't be empty and must not contain
app: BLOG
repo: blogs
date: 2026-09-21T14:03:58.487Z
status: fix_disabled
attempt: 1

# BLOG · api · 1n1zitj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprints nldp9d / 1wesr5x / 1pjm3cl (same app, service, shop, request and second: BLOG api, shop nrkjbmKkyf9JkdTeYH74, GET /api/blog-assist/618948428117/%5Bobject%20Object%5D at 2026-09-21T13:53:30Z). This alert is the third ERROR line of that same single request — errorService's `[handleError]` re-log — not a new failure. Cause unchanged and still unfixed on master: the AI Assistant modal's Cancel button is wired `onAction: handleChangeActive`, so Polaris passes the click MouseEvent as the first arg of SEOSetting's `handleChange(type, statusKey)`, it lands in `typeAi`, the modal remounts and refetches `/blog-assist/:blogId/${typeAi}` which string-coerces to `[object Object]`, reaching Firestore `.select('[object Object]')` — an illegal field path.

**Mechanism.** Polaris v13 buttonFrom maps `onClick: onAction`, so AIAssistantModal.jsx:122 (`onAction: handleChangeActive`, passed bare — unlike the wrapped call sites at :99 and :114) hands a React MouseEvent to SEOSetting.jsx:97 `handleChangeActive: handleChange`, which is SEOSetting.jsx:68 `if (type) setTypeAi(type)` — no type check, so the event object becomes typeAi. `AIAssistantModalUI` is a useCallback component with deps `[typeAi, active]` (SEOSetting.jsx:101), so its identity changes and React unmounts/remounts AIAssistantModal; useFetchApi's mount-only effect (useFetchApi.js:90, deps `[]`) refires against AIAssistantModal.jsx:38 `url: `/blog-assist/${id}/${type}`` with the object → `/api/blog-assist/618948428117/%5Bobject%20Object%5D`. Server side: blogAssist.controller.js:79 only rejects falsy and the literal 'undefined', so the truthy string '[object Object]' passes to blogAssist.service.js:51 → blogAssist.repository.js:42 `collection.select(select)`, and @google-cloud/firestore validateFieldPath throws because the path contains '[' and ']'. The controller catch logs `[getBlogAssistByBlogId]` and rethrows, the router error path logs `[unhandledError]`, and errorService.js:12 logs `[handleError]` with `user.shop?.shopifyDomain` undefined — the exact text of this alert, one request producing three ERROR lines and therefore three distinct fingerprints.

Confidence: `high`

## Code
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:122` — `onAction: handleChangeActive` passed bare — Polaris hands the click MouseEvent in as the first arg. Lines 99 and 114 wrap the same callback; this one does not.
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:38` — `url: `/blog-assist/${id}/${type}`` string-interpolates `type`, so an object becomes the literal `[object Object]` path segment seen in the failing URL.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:68` — `if (type) setTypeAi(type)` — no type check, so the MouseEvent is stored as the assistFor value.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:97` — `handleChangeActive: handleChange` binds the two-arg setter directly to the modal's close callback prop.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:101` — useCallback deps `[typeAi, active]` change the component identity on every typeAi change, remounting AIAssistantModal so the mount-only fetch refires with the poisoned type.
- `packages/assets/src/hooks/api/useFetchApi.js:90` — Fetch effect has `[]` deps — it only fires on mount, which is why the remount is what issues the bad GET.
- `packages/functions/src/controllers/blogAssist.controller.js:79` — Guard rejects only falsy blogId/assistFor and the literal string 'undefined'; '[object Object]' is truthy and passes through to Firestore.
- `packages/functions/src/services/blogAssist.service.js:51` — Passes the unvalidated assistFor straight into findOneFieldByBlogId as the select field.
- `packages/functions/src/repositories/blogAssist.repository.js:42` — `collection.select(select)` with the unvalidated path — validateFieldPath throws because '[object Object]' contains '[' and ']'.
- `packages/functions/src/services/errorService.js:12` — `logger.error('[handleError]', user.shopID, user.shop?.shopifyDomain, err)` — emits this alert's exact text, including the `undefined` for a missing shopifyDomain.

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.774Z" AND timestamp<="2026-09-21T14:08:42.774Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"%5Bobject%20Object%5D"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.774Z" AND timestamp<="2026-09-21T14:08:42.774Z" AND severity>=ERROR AND jsonPayload.message:"[handleError]"`

## Job
- analyze rounds: 1
- cost: $1.31

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
