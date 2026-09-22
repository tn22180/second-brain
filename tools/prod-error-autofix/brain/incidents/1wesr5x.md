fingerprint: 1wesr5x
service: api
message: [unhandledError] GET /api/blog-assist/618948428117/%5Bobject%20Object%5D 500 Element at index 0 is not a valid field path. Paths can't be empty and must not contain
app: BLOG
repo: blogs
date: 2026-09-21T13:58:01.312Z
status: fix_disabled
attempt: 1

# BLOG · api · 1wesr5x

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint nldp9d (same app/service/message/window, no fix on master): the AI Assistant modal's Cancel secondaryAction is wired as `onAction: handleChangeActive`, so Polaris passes the click MouseEvent as the first argument of SEOSetting's `handleChange(type, statusKey)`, which stores it in `typeAi`; the modal remounts and refetches `/blog-assist/:blogId/${typeAi}`, which string-coerces to `[object Object]` and reaches Firestore `collection.select('[object Object]')` — an illegal field path.

**Mechanism.** The two 500s at 13:53:29.750Z and 13:53:30.194Z are both `GET /api/blog-assist/618948428117/%5Bobject%20Object%5D`, i.e. the path segment is the literal string `[object Object]`. Frontend: Polaris v13 `buttonFrom` maps `onClick: onAction` and binds it to the native button, so the handler receives a React MouseEvent. AIAssistantModal.jsx:122 passes `handleChangeActive` bare as the Cancel `onAction` (lines 99 and 114 wrap the same callback in an arrow; this one does not), and SEOSetting.jsx:97 binds `handleChangeActive: handleChange`. A Cancel click therefore runs `handleChange(mouseEvent)` → SEOSetting.jsx:68 `if (type) setTypeAi(type)` stores the event object. `AIAssistantModalUI` is a `useCallback` component whose identity changes on deps `[typeAi, active]` (SEOSetting.jsx:101), so React unmounts and remounts AIAssistantModal; useFetchApi's mount-only effect (useFetchApi.js:90, deps `[]`) refires against AIAssistantModal.jsx:37-38 `url: `/blog-assist/${id}/${type}``, where `type` is now an object → interpolates to `[object Object]` → URL-encoded `%5Bobject%20Object%5D`. Backend: blogAssist.controller.js:79 guards only falsy values and the literal string `'undefined'`, so the truthy `'[object Object]'` passes to blogAssist.service.js:51 `findOneFieldByBlogId(blogId, assistFor)` → blogAssist.repository.js:40-41 `collection.select(select)`, and @google-cloud/firestore's validateFieldPath rejects it because the path contains `[` and `]` — exactly the alerted message. The 6 ERROR lines are 3 per failed request ([getBlogAssistByBlogId] → [unhandledError] → [handleError]), matching the 2 request-log 500s one-to-one.

Confidence: `high`

## Code
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:122` — Cancel secondaryAction `onAction: handleChangeActive` passed bare — Polaris hands the click MouseEvent in as arg 0. Lines 99 and 114 wrap the same callback; this one does not.
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:38` — `url: `/blog-assist/${id}/${type}`` string-interpolates `type`, so an object becomes the literal `[object Object]` path segment seen in the 500 URL.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:68` — `if (type) setTypeAi(type)` — no type check, so the MouseEvent is stored as the assistFor value.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:97` — `handleChangeActive: handleChange` binds the two-arg setter directly to the modal's close callback prop.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:101` — useCallback deps `[typeAi, active]` make AIAssistantModalUI a new component type on every typeAi change, remounting AIAssistantModal so useFetchApi's mount-only effect refires with the poisoned type.
- `packages/assets/src/hooks/api/useFetchApi.js:90` — Fetch effect has `[]` deps — it only fires on mount, which is why the remount is what actually issues the bad GET.
- `packages/functions/src/controllers/blogAssist.controller.js:79` — Guard rejects only falsy blogId/assistFor and the literal string 'undefined'; '[object Object]' is truthy and passes to Firestore.
- `packages/functions/src/services/blogAssist.service.js:51` — Passes assistFor straight through as the Firestore field-path `select` argument.
- `packages/functions/src/repositories/blogAssist.repository.js:40` — `collection.select(select)` with the unvalidated path param — validateFieldPath throws because '[object Object]' contains '[' and ']'.

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.686Z" AND timestamp<="2026-09-21T14:08:42.686Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"%5Bobject%20Object%5D"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.686Z" AND timestamp<="2026-09-21T14:08:42.686Z" AND severity>=ERROR AND jsonPayload.error.message:"is not a valid field path"`

## Job
- analyze rounds: 1
- cost: $1.22

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
