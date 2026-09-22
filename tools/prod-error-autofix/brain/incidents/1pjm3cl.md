fingerprint: 1pjm3cl
service: api
message: HTTP 500 GET /api/blog-assist/618948428117/%5Bobject%20Object%5D
app: BLOG
repo: blogs
date: 2026-09-21T14:02:35.285Z
status: fix_disabled
attempt: 1

# BLOG · api · 1pjm3cl

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprints nldp9d / 1wesr5x (same app/service/message/day, still unfixed on master): the AI Assistant modal's Cancel action is wired as `onAction: handleChangeActive`, so Polaris passes the click event as the first argument to `handleChange(type, statusKey)`, which stores the event object in `typeAi`; the modal's useFetchApi URL then interpolates it to the literal string `[object Object]`, and the backend hands that straight to Firestore `.select()`, which rejects it because a field path may not contain `[]`.

**Mechanism.** SEOSetting renders <AIAssistantModal handleChangeActive={handleChange} type={typeAi}> (SEOSetting.jsx:94,97). Inside the modal the locked-state Cancel button is `{content: ..., onAction: handleChangeActive}` (AIAssistantModal.jsx:122) — an unwrapped function reference, so Polaris invokes it with the React click event. `handleChange` does `if (type) setTypeAi(type)` (SEOSetting.jsx:68) with no type check, so `typeAi` becomes the event object. The modal is always mounted, so useFetchApi re-fires with `url: `/blog-assist/${id}/${type}`` (AIAssistantModal.jsx:38) → `/api/blog-assist/618948428117/%5Bobject%20Object%5D`, exactly the 2 of 2 failing request URLs in the window. Router `/blog-assist/:blogId/:assistFor` (routes/api.js:143) reaches `getBlogAssistByBlogId`, whose guard only rejects falsy/'undefined' blogId and falsy assistFor (blogAssist.controller.js:79), so `assistFor = '[object Object]'` passes. Service calls `findOneFieldByBlogId(blogId, assistFor)` (blogAssist.service.js:51) → `collection.select('[object Object]')` (blogAssist.repository.js:42), and @google-cloud/firestore validateFieldPath throws `Element at index 0 is not a valid field path. Paths can't be empty and must not contain "*~/[]".` — matching the prod stack frames lib/repositories/blogAssist.repository.js:62 → lib/services/blogAssist.service.js:100 → lib/controllers/blogAssist.controller.js:105. The controller logs, sets 500 and rethrows (blogAssist.controller.js:84-86), producing the [getBlogAssistByBlogId] / [unhandledError] / [handleError] triple seen 2× in the window.

Confidence: `high`

## Code
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:122` — `onAction: handleChangeActive` passes the Polaris click event as the first arg — the origin of the object
- `packages/assets/src/pages/Blog/BlogSettingLeft/LeftPostTab/SEOSetting.jsx:68` — `if (type) setTypeAi(type)` stores the event object as the assist type, no string check
- `packages/assets/src/components/AIAssistantModal/AIAssistantModal.jsx:38` — `url: /blog-assist/${id}/${type}` stringifies the object to `[object Object]`, producing the alerted path
- `packages/functions/src/controllers/blogAssist.controller.js:79` — guard accepts any truthy assistFor, so `[object Object]` reaches the service instead of a 400
- `packages/functions/src/repositories/blogAssist.repository.js:42` — `collection.select(select)` — the exact frame in the prod stack (lib/.../blogAssist.repository.js:62) where Firestore validateFieldPath throws

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.759Z" AND timestamp<="2026-09-21T14:08:42.759Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"%5Bobject%20Object%5D"`
- 6 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.759Z" AND timestamp<="2026-09-21T14:08:42.759Z" AND severity>=ERROR AND jsonPayload.message:"is not a valid field path"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T13:38:42.759Z" AND timestamp<="2026-09-21T14:08:42.759Z" AND severity>=ERROR AND jsonPayload.tag="[getBlogAssistByBlogId]"`

## Job
- analyze rounds: 2
- cost: $3.10

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
