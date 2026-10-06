# Brief: Blog AI Writer treo vô hạn (FAL-1100)

- Thread: https://avadaio.slack.com/archives/C08928RK00H/p1791238134262889
- Ticket: BLOG-261005-GDGuhP · Jira FAL-1100
- App: SEO On Blog (`blogs`, prod `avada-blog-app`)
- Shop: `2-0-lifestyle.myshopify.com` (Free, Shopify basic), balance 250,000
- Crisp: session_b03ac9da-7dba-4d36-8e13-e106636e3af6

## Problem

Content Manager > Create post with AI → spinner vô hạn, không ra bài. Ledger chỉ có record
MIGRATION, không có usage → request fail/timeout trước khi trừ credit. CS test lại trên store
khách + demo: OK. Tester (dungtt) gặp đúng 1 lần đầu trên `linhnguyen10`, sau đó không tái hiện.
Bot kết luận cannot-reproduce. → intermittent, nghi đường first-use/cold.

## Goal

Tìm root cause từ code + prod data. Fix để (1) lỗi gốc không xảy ra, hoặc tối thiểu (2) UI
không bao giờ treo vô hạn: lỗi/timeout phải hiện thông báo và tắt spinner. Kết thúc ở MR mở
từ `fix/ai-writer-stream-stall` → `master`.

Worktree: runner cắt `projects/Falcon/blogs-wt-blog-ai-writer-stall` (off origin/master).

## Decisions
- Jira FAL-1100 + Crisp transcript không đọc được (jira skill import `~/.claude/scripts/lib/jira.mjs` mất; Crisp prod `not_subscribed` từ 08-10) → dùng thread + prod Firestore, đủ dữ kiện.
- Cloud Logging latency `/langgraph/blog` không lấy được (config `sa` giờ là user account → reauth; bot SA không có logging.viewer) → kết luận dựa code + Firestore; ghi rõ là suy luận.
- Fix cả BE (root: stall LLM) lẫn FE (không bao giờ spinner vô hạn) → rẻ nhất để đảo ngược, mỗi bên tự đứng được.
- Idle timeout: LLM 60s, client 45s + server `:ping` 15s. Client 45s < server 60s là cố ý: ping vẫn chạy khi server đang chờ LLM, nên client chỉ trip khi kết nối chết thật; LLM stall do server tự bắt → SSE `error`.
- ChatOpenAI `timeout: 60000, maxRetries: 2` (default LangChain 6 retry) → ảnh hưởng mọi node LangGraph dùng factory này; chấp nhận vì 6×retry vượt budget 540s.
- Helper `withIdleTimeout` đặt ở `packages/functions/src/helpers/` để FE import qua `@functions` (có tiền lệ `devZoneAccess`) → FE node dep BE node.
- Không đụng: image generation `Promise.allSettled(pendingImagePromises)` không timeout (callModelNode ~:441) → ngoài scope, ghi finding.

- Run1 be ⛔ không phải do code: shell env `GOOGLE_APPLICATION_CREDENTIALS=~/.openclaw/firebase-sa.json` (file không tồn tại) làm test controllers sẵn có fail khi init firebase-admin. Verify đổi sang `env -u GOOGLE_APPLICATION_CREDENTIALS npx jest …`, rerun graph (worktree node giữ diff). Không phải lách cap: 5 round cũ thất bại cùng 1 nguyên nhân ngoài scope agent.

- Graph rerun ⛔ lần 2: test xanh hết, chỉ check `security` fail `review_unavailable` (JSON không parse). Root: Stop hook repo `blogs/.claude/hooks/check-docs.sh` block MỌI session có code đổi mà `docs/` không đổi — kể cả reviewer `claude -p` của harness → lượt cuối là trả lời hook, JSON lúc có lúc không. Cùng lỗi đang chặn graph `sec-p5-blogs`. Fix ngoài scope (prod-error-autofix `security.ts` nên spawn reviewer không hook) → báo user. Workaround: diff có `docs/features/ai-blog-generator.md` (đúng quy ước repo luôn) → hook exit 0.
- Bỏ graph runner cho phần còn lại, làm in-session (§7): mỗi rerun runner đốt 5 round sonnet vì lỗi hạ tầng.
- Review BE: tưởng có unhandled rejection khi timeout thắng race → sai, `Promise.race` đã subscribe `next`; mutation test xác nhận, đã gỡ.
- FE test polyfill `AbortController` bằng `abort-controller` (transitive, có trong yarn.lock, chỉ test) → chấp nhận.
- Delta prettier (`a303bc543`) verify không có `security` vì hook docs lại nuốt JSON; security toàn branch chạy gate standalone sau commit (worktree sạch, 1 turn) → `findings: []`.
- Test heartbeat controller không viết (agent bỏ, controller import nặng) → heartbeat chỉ được cover bằng review; ghi trong MR.

## Findings

- Prod (`avada-blog-app`, read-only): shop `Cyk0O2M14H1CcSloVSfp`. Chỉ 1 `blogGenerationClaims` (4334a2d6…, done, 10-05 21:56:20Z = lần CS test OK, trừ 60,000). Các lần treo không để lại claim/deduction → chết trước `saveGeneratedArticle` (claim tạo SAU generation, `langGraphController.js:~127`). `linhnguyen10` (`FiNnkxsSJ96AC1ZWnaz8`) cũng chỉ có 1 claim done.
- errorAlerts 10-05: `si69xk` `[generate] LangGraph generation failed … gemini-2.5-flash-lite temporarily rate-limited upstream` ×31 → upstream OpenRouter đang chập chờn hôm đó.
- Root cause (code): `callModelNode.js:313,412` `for await` stream LLM không idle timeout; `openAiChatModel.js` không `timeout`, LangChain retry 6 lần → stall giữ tới GCF kill 540s. Controller không gửi byte nào giữa `ready` và chunk đầu → FE không phân biệt chậm vs chết.
- FE: `GenerateBlogPost.jsx:102` không deadline; `onError :346` chỉ `setStatus('error')` không toast → lỗi HTTP (429 rate limit 3/300s/IP `config/rateLimit.js:22`, 400 Not enough tokens, 500) ra màn trắng; handshake fail `:486` → `idle` câm.

---

## Progress

Started: 2026-10-06 · Graph: `jobs/graphs/blog-ai-writer-stall.json` · branch `fix/ai-writer-stream-stall`

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | be: withIdleTimeout + LLM stall abort + SSE ping + doc | cc-p / sonnet → inline | ✅ | graph 5+5 ⛔ (infra) · inline 1 | clean | `0d1d3f5fe`; harness verify 6/6; jest 124/124 |
| 2 | fe: client watchdog + error toast + doc refs | general-purpose / sonnet (in-session) | ✅ | 1/5 | clean | `57c0e95a6`; harness verify 6/6; jest 11/11 |

### Status: COMPLETE — 2026-10-06

- MR: https://git.avada.net/avada/blogs/-/merge_requests/913 (not merged, not deployed; needs tag)
- Commits: `0d1d3f5fe` BE · `57c0e95a6` FE · `a303bc543` prettier
- Rounds: be graph 10 (infra, không tính code) + inline 1 · fe 1
- Tests: 35 suites / 252 pass (scope); full 990/995, 5 fail có sẵn trên master
- Security: clean (whole branch, 794-line diff)
- Out-of-scope findings for Tuan:
  1. Harness security gate flaky trên repo có Stop hook: `blogs/.claude/hooks/check-docs.sh` chạy trong reviewer `claude -p` → fix ở `prod-error-autofix/src/verify/security.ts` (spawn reviewer không load hook). Đang chặn graph `sec-p5-blogs`.
  2. Shell env `GOOGLE_APPLICATION_CREDENTIALS=~/.openclaw/firebase-sa.json` trỏ file không tồn tại → mọi test init firebase-admin fail.
  3. gcloud config `sa` giờ là account user (reauth), không còn SA → memory `gcloud-sa-config-no-reauth` sai.
  4. jira skill hỏng: import `~/.claude/scripts/lib/jira.mjs` không tồn tại.
  5. Image generation chưa có timeout (callModelNode `Promise.allSettled(pendingImagePromises)`).
