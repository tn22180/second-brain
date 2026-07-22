 tiện thì t cần đóng gói cho tất cả prod project của t nên m làm skill hay gì thì tuỳ, khi báo slack cần định nghĩa
  rõ là từ app nào và bug cần chi tiết + cloud run job cũng cần check bug như ở SEO đang có dùng cloud run job: những app cần làm SEO, BLOG, AI copy product, LLM txt, Image optimizer

---

## Progress

Started: 2026-07-22

Spec: `avada-prod-error-alert/docs/specs/2026-07-22-prod-error-alert-design.md`
Plan: `avada-prod-error-alert/docs/plans/2026-07-22-prod-error-alert.md`
Scope chốt: Lib `@avada/prod-error-alert` + skill port + wire SEO reference. Publish/deploy = ngoài session.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Package scaffold | ✅ | |
| 2 | extractMessage (+httpRequest fallback) | ✅ | |
| 3 | resolveService (+cloud_run_job) | ✅ | |
| 4 | normalize/classify/hashId | ✅ | |
| 5 | buildSlackPayload (app-name-first) | ✅ | |
| 6 | claimErrorAlert (Firestore dedupe) | ✅ | |
| 7 | createErrorAlertHandler factory + index | ✅ | |
| 8 | Parity test vs SEO output | ✅ | |
| 9 | Sink setup script (parametrized) | ✅ | |
| 10 | Porting skill avada-prod-error-alert | ✅ | |
| 11 | Wire SEO reference | ✅ | |

### Log

#### ✅ Task 1: Package scaffold
- Status: ✅ pending

**Status: COMPLETE (2026-07-22)** — Lib `@avada/prod-error-alert` (7 units, 27 tests, builds to CJS), sink script (cloud_run_job + NOT-self filter), porting skill + templates, SEO wired onto the lib (branch `feat/prod-error-alert-lib`). Publish + per-app deploy + Slack bot/channel = out-of-session.

### Rollout all 5 apps (2026-07-22)
Cả 5 app đã wire lib + push branch (review OK từng cái):
- SEO `feat/prod-error-alert-lib` — routed + bespoke deleted
- BLOG/APC/IMG-OPT/AEO `feat/prod-error-alert` — AEO gen1, còn lại gen2; IMG-OPT thêm Slack infra
Còn lại: publish lib + tạo Slack bot/channel + chạy sink + deploy (out-of-session).
