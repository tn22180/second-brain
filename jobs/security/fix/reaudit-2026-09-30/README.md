# Re-audit 2026-09-30 — security high, 5 app

So với tag prod mới nhất (= code đang chạy). Chi tiết từng app ở file cùng thư mục.

| App | Prod tag | Fix của mình lên prod? | Lỗ high còn mở ở prod |
|---|---|---|---|
| SEO | `v1.86.48` | ✅ (từ `v1.86.45`) | 18 fixed · 4 open có chủ đích (G1 rotate, G2 BigQuery, G6 FAL-720, G16 ingress) · 2 partial · 0 regress · **1 mới** |
| APC | `v1.6.45` | ❌ branch chưa push | 22/23 (1 do FAL-658 vá) + toàn bộ nhóm credit |
| IMG-OPT | `v1.7.83` | ❌ branch + hotfix chưa push | 32/32, gồm **log token merchant đang chạy** |
| AEO | `v1.6.38` | ❌ branch chưa push | toàn bộ; MR `!114` người khác vá một phần |
| BLOG | `v1.85.8` (= master) | ❌ branch chưa push | 26/26 |

## Mới phát hiện

- SEO `firestore.rules:140-148`: `featureReq`/`commentFeatureReq` update/delete chỉ cần
  `isStandaloneSession()`, không check shop → shop standalone sửa/xoá doc shop khác qua SDK,
  lách guard G17 backend. Phase 4 (`ae25d3ba97a`) cố ý để lại.
- BLOG `29b2da68a`: `canInternalUseDevZone` nới từ `['legacy-plan']` thành mọi type → support key
  có `devZone` gọi được `set-token`, `update-token-free`, `redis-*`. Nặng thêm G12.
- APC FAL-658 bundle billing (`activateBundle`, `cancelBundleCharge`, verify charge) chưa ai review billing.

## MR song song của người khác

- **AEO `!114`** (FAL-580): **đừng merge phần competitors (G6)** — scope theo shopId một blocklist
  global, data cũ 0 `shopId` → tắt chặn đối thủ toàn fleet. Phần SSRF / App-Proxy signature /
  GraphQL injection / xoá `appIntegationKeys.js` nên giữ. Không bind `validateAccessToken`.
- **IMG-OPT `!261`** (61 fixes, 78 file): mỗi bên fix 17/32, bổ sung cho nhau. `!261` có 2 regression:
  bỏ gate `canAccessDevZone` ở `startFreeRun`; mất `publicSpeedAuditController.js`. Conflict:
  route `/public` (xoá vs gate), `/shop` (blocklist vs allowlist), integration key gate. Không fix log token.

## Rebase branch của mình

- APC: 3 file conflict vừa (`generatorController` cancel, `subscribeHandleBulkGenerate` done,
  `SeoLegacyPlanModal.jsx`) — FAL-658 thêm `logCreditGranted()` cạnh khối refund.
- BLOG: 7/48 file đổi upstream, chỉ `langGraphController.generate()` conflict thật (auto-tag charge).

## Tracking doc lệch

`jobs/2026-09-30-security-phase4-status.md` ghi T1 SEO còn Draft — master đã đóng.
