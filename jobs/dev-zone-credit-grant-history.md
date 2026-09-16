# Dev zone: lịch sử cấp AI credit free + mở staging cho nhân viên

Ngày: 2026-09-16. Yêu cầu từ CS AI: trước khi cấp credit free cho shop phải thấy đã cấp
lần nào chưa, tránh cấp hai lần. 3 app: SEO, BLOG, APC. Kèm theo: dev zone đang chết trên
staging với session embed/local vì gate chỉ nhận `isCrmLogin === true`.

## Hiện trạng (origin/master, verify 2026-09-16)


| App  | Grant endpoint                                                                                 | Ghi vào                                                                       | Log grant                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEO  | `POST /dev?x=ai_credit` — `packages/functions/src/controllers/devController.js:1490`           | `shops.AICreditQuota`, `shops.AIUsage.metaCount` (overwrite)                  | không — `apiLogs` chỉ ghi "đã gọi /dev", không có số                                                                                                 |
| BLOG | `PUT /dev_zone?type=set-token` — `packages/functions/src/controllers/devZoneController.js:223` | `TokenUser.token/additionalToken` (overwrite, `lastTokenSource=ADMIN`)        | gián tiếp: trigger `onTokenUserWritten` → `tokenLogs` source=ADMIN, chỉ khi số tăng, không có lý do/người cấp; page `/token-history` là của merchant |
| APC  | `POST /credit` — `packages/functions/src/controllers/shopController.js:105`                    | `credits.creditInfo.{credits,additionalCredits,lastCreditUpdate}` (overwrite) | không                                                                                                                                                |


Auth cả 3: `packages/functions/src/helpers/devZoneAccess.js` → `canAccessDevZone = isCrmLogin === true`.
Session embed (`verifyEmbedRequest` @avada/core) không có claim đó, identity duy nhất là
`ctx.state.user.shopData.email` (email chủ store). Session CRM login-as mang email merchant,
không mang email CS.

## Quyết định

1. **Log grant tường minh trong handler** (không dựa trigger). Collection `creditGrants`
 (BLOG: `tokenGrants`), 1 doc/lần cấp:
 `shopId, shopDomain, before{…}, after{…}, delta, note, actor, actorType, createdAt`.
 `note` bắt buộc — CS ghi tên + ticket vì session không có identity CS. Backend reject thiếu note.
2. `**GET …/credit-grants**` sau gate dev zone hiện có, 20 grant gần nhất của shop.
3. **Bảng "Lịch sử cấp" ngay trên form cấp** trong dev zone: ngày, delta, before→after, note,
 actor. Trống → "Chưa cấp lần nào". Reload sau khi cấp.
4. **Mở staging cho nhân viên**, rule mới:
  ```
   canAccessDevZone({user, isProduction})
     = isCrmLogin === true                                   // prod + staging, giữ nguyên
     || (isProduction === false && isAvadaStaffEmail(user))  // staging only
  ```
  - `isProduction` từ `APP_ENV` server-side (`config/app.js`), không đọc từ request/claim.
  Test: `isProduction: true` + email avada vẫn 403.
  - Domain exact-match sau `@`, lowercase, allow-list `avada.io`, `avada.email`,
  `avadagroup.com`, `mageplaza.com` (cùng `checkPartner.js` APC). Không `includes('avada')`.
  - Email: `user.email` (Google sign-in) → `user.shopData.email` (embed). Nhánh embed dựa
  email chủ store tự khai → chỉ mở staging. Prod CRM-only.
  - Nhánh staff vẫn qua audit log, `actorType: 'staff-staging'`.
  - `canRenderDevZone` frontend nhận `isProduction` từ config assets (cần flag build-time).
  - Không đụng `canInternalUseDevZone`, `canUseMachineDevZone`.
5. Không backfill. BLOG có thể hiện thêm dòng cũ từ `tokenLogs` ADMIN đánh dấu "trước khi có log" — làm sau nếu cần.
6. Sửa tiện tay: APC `updateCredit` đang `shop.email.includes('avada')` → dùng helper domain exact-match.

## Task

3 MR riêng, mỗi repo 1 worktree `[[ORCA_RICH_MD:ce2ab94a3121cb44c7e5d8e02b84b84b:inline-html:%3Crepo%3E]]-wt-credit-grants`, branch từ `origin/master`, TDD, không deploy.

- [x] SEO — `feat/dev-zone-credit-grants`
- [x] BLOG — `feat/dev-zone-credit-grants` (base `master`)
- [x] APC — `feat/dev-zone-credit-grants`

Mỗi MR:

- [x] `devZoneAccess.js` + test: rule staging cho staff
- [x] service ghi grant + test (delta đúng, note bắt buộc, before/after snapshot)
- [x] `GET` grants sau gate + test 403 non-CRM trên prod
- [x] form cấp thêm `note`, bảng lịch sử phía trên form
- [x] frontend flag `isProduction` cho `canRenderDevZone`
- [x] lint + test pass, `yarn.lock` không đổi (không thêm dep)

## Tiến độ

(cập nhật bên dưới)
- 2026-09-16: cả 3 MR ĐÃ MERGE vào master (verify glab, state=merged). Worktree đã xoá, branch
  feat/dev-zone-credit-grants giữ trên remote.
  - LƯU Ý deploy: cả 3 repo prod deploy THEO TAG, merge master = chưa lên prod. Muốn prod có grant
    history thì phải cắt tag. APC staging deploy pin 1 branch (CI only: $CI_COMMIT_BRANCH) — master
    không auto deploy staging.
