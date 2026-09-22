fingerprint: nldp9d
service: api
message: [getBlogAssistByBlogId] nrkjbmKkyf9JkdTeYH74 Error: Element at index 0 is not a valid field path. Paths can't be empty and must not contain
app: BLOG
repo: blogs
date: 2026-09-21T13:56:47.274Z
status: fix_disabled
attempt: 1

# BLOG · api · nldp9d

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The AI Assistant modal's Cancel button is wired as `onAction: handleChangeActive`, so Polaris passes the click MouseEvent as the first argument of SEOSetting's `handleChange(type, statusKey)`, which stores it in `typeAi`; the modal is then remounted and refetches `/blog-assist/:blogId/${typeAi}`, which URL-encodes to `[object Object]` and reaches Firestore `.select('[object Object]')` — an illegal field path.

**Mechanism.** Polaris v13 `buttonFrom` maps `onClick: onAction` (node_modules/@shopify/polaris/build/esm/components/Button/utils.js:24) and `UnstyledButton` binds that straight to the native button's onClick, so the handler receives a React MouseEvent. AIAssistantModal.jsx:122 passes `handleChangeActive` bare (unlike :99 and :114 which wrap it), and SEOSetting.jsx:97 binds `handleChangeActive: handleChange`. So a Cancel click runs `handleChange(mouseEvent)` → SEOSetting.jsx:68 `setTypeAi(mouseEvent)`. `AIAssistantModalUI` is a `useCallback` component whose identity changes on `[typeAi, active]` (SEOSetting.jsx:101), so React unmounts and remounts AIAssistantModal; useFetchApi fires its mount-only effect (useFetchApi.js:90-97) against AIAssistantModal.jsx:38 `url: `/blog-assist/${id}/${type}`` where `type` is now an object → string-coerced to `[object Object]`, sent as `/api/blog-assist/618948428117/%5Bobject%20Object%5D`. Backend: the guard at blogAssist.controller.js:79 only rejects falsy/`'undefined'`, so the truthy string passes to blogAssist.service.js:51 → blogAssist.repository.js:42 `collection.select('[object Object]')`, and @google-cloud/firestore's validateFieldPath rejects it because the path contains `[` and `]` — exactly the alert's message.

Confidence: `high`

## Code
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:122` — `onAction: handleChangeActive` passed bare — Polaris hands the click event in as the first arg. Lines 99 and 114 wrap the same callback, this one does not.
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:38` — `url: `/blog-assist/${id}/${type}`` — string-interpolates `type`, so an object becomes the literal `[object Object]` path segment seen in the 500 URL.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:68` — `if (type) setTypeAi(type)` — no type check, so the MouseEvent is stored as the assistFor value.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:97` — `handleChangeActive: handleChange` — binds the two-arg setter directly to the modal's close callback prop.
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:101` — useCallback deps `[typeAi, active]` make `AIAssistantModalUI` a new component type on every typeAi change, remounting AIAssistantModal so useFetchApi's mount-only effect refires with the poisoned type.
- `packages/assets/src/hooks/api/useFetchApi.js:90` — The fetch effect has `[]` deps — it only fires on mount, which is why the remount at SEOSetting.jsx:101 is what actually issues the bad GET.
- `packages/functions/src/controllers/blogAssist.controller.js:79` — Guard only rejects falsy blogId/assistFor and the literal string 'undefined'; '[object Object]' is truthy and passes through to Firestore.
- `packages/functions/src/repositories/blogAssist.repository.js:42` — `collection.select(select)` with the unvalidated path param — validateFieldPath throws because '[object Object]' contains '[' and ']'.

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.353Z" AND timestamp<="2026-09-21T14:08:42.353Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"%5Bobject%20Object%5D"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.353Z" AND timestamp<="2026-09-21T14:08:42.353Z" AND severity>=ERROR AND jsonPayload.error.message:"is not a valid field path"`

## Job
- analyze rounds: 1
- cost: $2.49

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
