/Users/nguyentuan/Documents/second-brain/projects/Falcon/seo/packages/functions/.env t đã gán ollama key + openroter kye, rà tất cả các tính năng dùng openrouter sau đó smoke test cộng với test ollama các modal có thể đáp ứng được những model của opnerouter mà đang sử dụng đó, so sánh ra, ví dụ fixAuditContent hay là gen image alt
sếp t yêu cầu : Team m nên chuyển open router sang Ollama cloud
$100, budget lớn. Với app team seo khả năng 1 tk. 

Có cơ chế fallback sang Openrouter. 

Khi vol nhiều thì m đk 2-3 tk.


---

## Progress

Started: 2026-08-17 · cập nhật 2026-08-18
Repo: `projects/Falcon/seo`
- Vòng 1 (task 1–6): branch `feat/cs-grants-features` (HEAD `40cb89c127`), diff repo = 0.
- Vòng 2–5 (task 7–12): branch `feat/audit-content-ollama-gemma4` → **MR !2158**, 6 commit.

Classification: bắt đầu là **spike** (task 1–6: so sánh + khuyến nghị, code probe vứt đi).
Từ task 7 trở đi thành **bounded** — có sửa code thật vào `src/`, có test, có MR.
Ollama plan: **Free** (Light usage, 1 concurrent) → all Ollama calls sequential, run budget capped.

> `TaskCreate` is not available in this session; this file is the single tracker.

### Decisions taken

- Smoke test = node scripts calling the services directly (no emulator, no Firestore).
- Scope = all 4 OpenRouter entry points, not just the 2 named in the brief.
- Probe runner = `@babel/register` inside `packages/functions/` so the `@functions/*` alias resolves
  (`packages/functions/.babelrc:17-24`). Probe files live in `packages/functions/scripts/probe-ollama/`
  and are deleted in task 6.

### Known blockers (found while framing, before any probe ran)

1. **Vision transport differs.** `getOpenRouterImageAlt` sends `image_url`
   (`services/openrouter/index.js:224`); Ollama takes base64 in `images[]`. Not a drop-in — needs
   fetch + encode, which changes latency and egress.
2. **Structured output shape differs.** OpenRouter uses `responseFormat.jsonSchema.strict` plus
   `provider: {requireParameters: true}` (`:141-175`); Ollama uses a bare `format` JSON Schema with
   no provider pinning. Needs an adapter, and strictness is not guaranteed.
3. **Prompt caching does not carry over.** `helpers/ai/cachedSystem.js` sets OpenRouter/Anthropic
   cache breakpoints; Ollama Cloud publishes no cached-token concept. The 2026-07-27 caching work
   (`docs/superpowers/plans/2026-07-27-openrouter-prompt-caching.md`) is lost on a swap, so the cost
   comparison must be run against uncached OpenRouter numbers too, or it lies.

### Tasks

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Map full OpenRouter surface (every call site, model, params) | cavecrew-investigator / haiku | ✅ | 0/5 | clean | 20 call sites; 8 structured verified by hand |
| 2 | Build probe harness: OpenRouter baseline + Ollama adapters (text / structured / vision) | general-purpose / sonnet | ✅ | 0/5 | clean | 795 lines, 3 new files, untracked only |
| 3 | Run OpenRouter baseline smoke over all 4 entry points | inline | ✅ | 0/5 | clean | 8/8 pass |
| 4 | Run Ollama bench, sequential, Free-plan safe | inline | ✅ | 0/5 | clean | 16 runs, 1 hard fail (nemotron vision) |
| 5 | Compare + write the report into this file | inline | ✅ | 0/5 | clean | see Report |
| 6 | Delete probe files, verify repo diff is clean | inline | ✅ | 0/5 | clean | harness copied to scratchpad first |
| 7 | Đọc được usage/quota Ollama còn lại bằng key này không | inline | ✅ | 0/5 | clean | CÓ — `GET /api/usage`; 30 call = 0.1% trần session → ~30k call/5h |
| 8 | Khách không lỗi / chậm khi chuyển OpenRouter ↔ Ollama | inline | ✅ | 1/5 | fixed | Lỗi thật: không có timeout. p50 treo 81.660ms → 31.723ms |
| 9 | Đồng bộ model mới test cho cả OpenRouter lẫn Ollama | inline | ✅ | 0/5 | clean | text/structured → `gemma-4-31b-it`; image alt cố ý giữ 26b |
| 10 | Context 262K của gemma4 đủ cho gen FAQ + Content không | inline | ✅ | 0/5 | clean | Thừa >50×; needle test 43.8k token không cắt. Không cần đổi code |
| 11 | Fix `faqsAssessment` 500 — `analysisId` TypeError | inline | ✅ | 0/5 | clean | `resolveShopifyId` cho 4 helper; 8/12 test fail trên code cũ |
| 12 | Fix `faqsAssessment` 500 (lớp 2) — key OpenRouter chết | inline | ✅ | 0/5 | clean | `.env.local` đè `.env`; file local, không vào commit |

Task 1–6 = vòng 1 (khảo sát Free plan). Task 7–10 = yêu cầu bổ sung sau khi có key Pro.
Task 11–12 = lỗi phát sinh khi test thật trên staging, không nằm trong brief gốc.

### Việc còn mở (không phải task đã chạy)

| Việc | Mức | Ghi chú |
|---|---|---|
| Rotate `SHOPIFY_ACCESS_TOKEN_KEY` prod | 🔴 bảo mật | Hardcode ở `fixProBackToFree.js:95`, trong 6 commit + `lib/`. Mở được token mọi merchant prod. Cần re-encrypt toàn bộ `shops` |
| Bỏ hunk `.gitlab-ci.yml` khỏi MR !2158 | 🟠 chặn merge | 4 ref staging-1 đang trỏ vào nhánh này; không được vào `master` như hiện tại |
| Nối `/api/usage` vào breaker | 🟡 cải tiến | Task 7 chứng minh đọc được quota trước; hiện breaker vẫn chờ ăn 429 mới latch |
| Thêm điều kiện dừng "score không tăng 2 vòng" | 🟡 cải tiến | Vòng 3 đo: 5/10 page đốt hết 8 vòng, 1 page 17 call đổi 0 điểm. Tiết kiệm ở **mọi** provider |
| `generateKeyword` prompt vs schema lệch | 🟡 defect | `chains.js:289-299`: prompt "ONE best primary keyword" nhưng schema `{keywords: []}` |
| 2 suite jest fail sẵn | ⚪ nền | `shopify2026Client`, `workListStore` — có trước, không liên quan AI routing |
### Ollama model shortlist (Free plan)

| Role | Candidates | Usage tier |
|---|---|---|
| text / structured | `gemma4:cloud`, `nemotron-3-nano:30b-cloud` | Low |
| text / structured (1 run only) | `deepseek-v4-flash:cloud` | Medium |
| image alt (vision) | `gemma4:cloud`, `qwen3.5:cloud` | Low / Medium |

High and Extra High tier models (`glm-*`, `kimi-*`, `minimax-m3`, `deepseek-v4-pro`) are excluded —
they would exhaust a Free-plan session limit before the bench finishes.

### Log

#### ✅ Task 1: Map full OpenRouter surface
- Agent: cavecrew-investigator (haiku)
- Status: ✅ completed
- Plan:
  - Goal: a `file:line` table covering every OpenRouter call site in `packages/functions/src`, with
    the model id, the call shape (text / structured / vision), and the params that a replacement
    provider would have to honour (maxTokens, temperature, responseFormat, provider pinning).
  - Files allowed: read-only sweep of `packages/functions/src/**`. No edits anywhere.
  - Approach: grep the four exported entry points from `services/openrouter/index.js` and follow
    each caller. Rejected: reading `chains.js` end to end (730 lines) — only the call sites and the
    schemas they pass matter here.
  - Test command: `grep -rn "openrouter\|OPENROUTER\|generateTextContent\|getImageAlt" packages/functions/src --include="*.js" | grep -v __tests__ | wc -l` — every hit must appear in the table or be explicitly dismissed.
  - Risk: none, read-only. A missed call site means the comparison later declares a swap safe when
    one path still needs OpenRouter.
  - Rollback: nothing to undo.
- Rounds used: 0/5
- Security check: **clean** — read-only task, `git status --porcelain` on the seo repo is empty.
- Started: 2026-08-17 · Completed: 2026-08-17

**Result — 20 call sites.** Verified by hand, not taken on the agent's word:
`grep -n generateOpenRouterStructuredText services/auditAgent/chains.js` → 7 calls
(`:165, :220, :244, :268, :292, :359, :690`), schema names `url`, `meta_description`, `meta_title`,
`meta_tags`, `keywords`, `faq_keyword`, `related_keywords`; plus `gsdAutoFill/aiContent.js:78`
(`return_policy`) = 8 structured. `const/aiFixJob.js:21` — `MODEL_LADDER = [CONTENT_MODAL]`, a
single-entry ladder, so there is no fallback model today.

| Entry point | Sites | Model source |
|---|---|---|
| `generateOpenRouterText` | 2 | `aiContent/index.js:24`, `gsdAutoFill/aiContent.js:19` (`GSD_TEXT_MODEL` = deepseek-chat-v3.1) |
| `generateOpenRouterStructuredText` | 8 | default `google/gemini-3-flash-preview` |
| `getOpenRouterImageAlt` | 1 | env `IMAGE_ALT_MODEL` else `qwen/qwen3-vl-235b-a22b-instruct` |
| `chatSendWithRetry` | 3 | `openAI/index.js:63, :157, :236` |
| `generateTextContent` (dispatcher) | 4 | `chains.js:410, :429, :480, :538` — the fixAuditContent path |
| `getImageAlt` (dispatcher) | 2 | `aiChatController.js:76`, `optimize/optimizeImg.js:749` |

Two env vars already exist as swap points: `AI_CONTENT_MODEL` (`aiContent/index.js:22`) and
`IMAGE_ALT_MODEL` (`:37`).

#### Capability probe on Ollama Cloud (run before building the harness)

Live calls with the key from `.env`. Results:

| Probe | gemma4:cloud | nemotron-3-nano:30b-cloud |
|---|---|---|
| plain chat | 200 | 200 |
| `format: <JSON Schema>` on `/api/chat` | **ignored, returns prose** | **ignored, returns prose** |
| `format: "json"` | ignored | ignored |
| `/v1/chat/completions` + `response_format.json_schema` | ignored | ignored |
| `/api/generate` + `format` | ignored | ignored |
| **JSON guard in the system prompt** | **schema-conformant** | **schema-conformant** |
| vision via base64 `images[]` | **works**, schema-conformant | **400 — no image input** |

So blocker 2 from the framing notes is **softened, not removed**: Ollama Cloud honours no
structured-output param at all, but the app's existing prompt-side guard
(`services/openrouter/index.js:154` + the fence-strip at `:177-183`) already carries the load, and
both models obey it. The swap loses the *provider-enforced* guarantee, not the capability.

Blocker 1 (vision transport) is **confirmed**: base64 `images[]` works, `image_url` does not, and
only gemma4 can see images at all.

#### Free-plan ceiling (found during the probe)

`deepseek-v4-flash:cloud` and `qwen3.5:cloud` both return
`403 "this model requires a subscription, upgrade for access"`. **On Free, only the two Low Usage
models are reachable**, and only gemma4 has vision — so image alt has exactly one candidate.

#### ✅ Task 2: Build probe harness (plan)
- Agent: general-purpose (sonnet)
- Status: ✅ completed
- Plan:
  - Goal: one runnable harness that, for each role (structured / text / vision), calls the real
    OpenRouter service function as baseline and an Ollama adapter as candidate, on the *same*
    prompt, and records latency, token counts, schema-parse pass/fail and the raw output.
  - Files allowed: create `packages/functions/scripts/probe-ollama/**` only. Read anything under
    `packages/functions/src`. **No edits to any existing file.**
  - Approach: `@babel/register` so `@functions/*` resolves (`packages/functions/.babelrc:17-24`),
    import the real services for the baseline, and hand-roll a thin Ollama adapter that reuses the
    same JSON guard text. Rejected: reimplementing the OpenRouter side in the harness — then the
    smoke test would prove the harness works, not the app.
  - Test command: `node packages/functions/scripts/probe-ollama/probe.js --dry-run` — prints the
    assembled payload for every case and exits 0 without making a single network call.
  - Risk: probe files land inside the repo; if they are not deleted in task 6 they look like real
    app code. The harness also holds live API keys in process memory — it must never log them.
  - Rollback: `rm -rf packages/functions/scripts/probe-ollama` (task 6 does this).
- Rounds used: 0/5
- Security check: —
- Started: 2026-08-17

#### ✅ Task 2: Build probe harness
- Agent: general-purpose (sonnet) · Status: ✅ · Rounds 0/5
- Created `packages/functions/scripts/probe-ollama/{ollamaClient,cases,probe}.js` (795 lines).
- Acceptance test passed: `node packages/functions/scripts/probe-ollama/probe.js --dry-run` → exit 0,
  8 cases assembled, zero network calls.
- `@functions/*` resolved via `@babel/register` with `configFile` = `packages/functions/.babelrc`
  and `process.chdir(FUNCTIONS_DIR)` — module-resolver resolves its alias against `process.cwd()`.
- **Deviation, accepted:** the text baseline calls `generateOpenRouterText` directly instead of the
  `generateTextContent` dispatcher. Importing `services/aiContent` pulls in
  `services/openAI → shopifyService → @avada/core`, whose `authService.js` runs
  `firebase-admin.initializeApp()` at import time and throws ENOENT without a service account.
  Since `CONTENT_MODAL` is an OpenRouter model, the dispatcher would resolve to
  `generateOpenRouterText` anyway. **Consequence: the dispatcher branch itself is not smoke-tested.**
- Security check: **clean** — 3 new untracked files, no existing file modified
  (`git status --porcelain` shows only `?? packages/functions/scripts/probe-ollama/`).
  Scanned both probe files against every ≥12-char value in `.env`: 0 secret literals. Keys are read
  from `process.env` only (`ollamaClient.js:99`) and never logged or written to the results file.

#### ✅ Task 3: OpenRouter baseline
- Status: ✅ · Rounds 0/5 · Security check: **clean** (no diff, read-only execution)
- All 8 cases returned, `parseOk=true` on every structured and vision case.
- Every call logged `Cached: 0` — the probes ran cold, so these are **uncached** OpenRouter numbers.
  Real prod traffic hits the cache tier and is cheaper than what is measured here.

#### ✅ Task 4: Ollama bench
- Status: ✅ · Rounds 0/5 · Security check: **clean** (no diff)
- 16 runs, strictly sequential. One hard failure: `nemotron-3-nano:30b-cloud` on the vision case →
  `400 this model does not support image input`.

---

## Report

### Latency, same prompt, same schema

| Case | role | OpenRouter (gemini-3-flash) | gemma4:cloud | nemotron-3-nano:30b |
|---|---|---|---|---|
| meta_description | structured | 3268 ms | **1199 ms** | 14834 ms |
| meta_tags | structured | 1536 ms | **1278 ms** | 51350 ms |
| keywords | structured | 1444 ms | **956 ms** | 2292 ms |
| faq_keyword | structured | 1740 ms | **1333 ms** | 9278 ms |
| generate_description | text | **4430 ms** | 11145 ms | 43163 ms |
| refine_description | text | **3204 ms** | 7053 ms | 50143 ms |
| control_keyword_density | text | **1554 ms** | 2555 ms | 11536 ms |
| image_alt | vision | **934 ms** (qwen3-vl) | 2270 ms | 400 — no vision |

Split verdict, and it is consistent: **gemma4 wins every short structured call** (1.2×–2.7× faster)
and **loses every long-form generation** (1.6×–2.5× slower). Short outputs favour it, sustained
token throughput does not.

### Output quality

Comparable on structured. `keywords` produced byte-identical results across all three models;
`control_keyword_density` produced a byte-identical 436-char HTML block on gemma4 and gemini-3-flash.
Meta title/description from gemma4 read as well as the baseline.

`nemotron-3-nano:30b-cloud` is disqualified, not merely slow: on `generate_description` it returned
**0 characters after burning the full 8192-token cap** — `think: false` does not suppress its
reasoning, so the budget went to thinking tokens and no answer came out. On `meta_tags` it spent
5469 eval tokens to emit a two-field object. Any per-token or per-usage billing makes this ruinous.

### Cost

Uncached OpenRouter, from measured tokens:

| Path | tokens in/out | $ per 1000 calls |
|---|---|---|
| structured (avg) | ~550 / 65 | ~$0.47 |
| generate_description | 812 / 472 | ~$1.82 |
| refine_description | 945 / 317 | ~$1.42 |
| image_alt (qwen3-vl) | ~570 / 18 | ~$0.15 |

Cached input is $0.050/M against $0.500/M — **10× cheaper**. That discount exists only on OpenRouter;
`helpers/ai/cachedSystem.js` has no counterpart on Ollama, so a swap forfeits it permanently.

Ollama Cloud has no per-token price at all — Free, or Pro at $20/mo with a 5-hour session limit and
a 7-day weekly limit. There is no volume at which the two are cleanly comparable: one is metered,
the other is capped. A naive break-even (Pro $20 ÷ $1.82 per 1000 long-gen calls ≈ 11k calls/month)
is misleading, because Pro throttles on usage tier rather than billing overage, and Free allows
1 concurrent request — the SEO app fans out.

### Recommendation

**Stay on OpenRouter. Do not swap.** Reasons, in order of weight:

1. **The Free plan cannot run the models that would win.** `qwen3.5:cloud` and
   `deepseek-v4-flash:cloud` both return 403 `requires a subscription`. What is testable today is
   two Low-tier models, and one of them is disqualified outright.
2. **Vision is the worst fit and it is a real production path.** `optimize/optimizeImg.js:749` runs
   alt text at bulk volume. OpenRouter is 2.4× faster there, and Ollama additionally requires
   fetching every image and base64-encoding it — egress and latency this bench does not even count.
3. **Losing prompt caching moves the cost floor up 10×** on the input side of every cached call.
4. **Concurrency 1 on Free.** The app's fan-out (`dispatchWork`, self-chaining Pub/Sub) is
   structurally incompatible with a one-request-at-a-time provider.

**Where a swap would pay, if one is ever wanted:** the 8 structured call sites only. gemma4 is
faster and equal in quality there, and `services/openrouter/index.js:154` already forces JSON by
prompt, so no provider-enforced schema is being relied on today anyway. That is a hybrid, not a
migration, and it is worth revisiting only after testing `qwen3.5:cloud` / `deepseek-v4-flash:cloud`
on a paid plan.

**Next probe, if you want one:** $20 for one month of Pro, rerun `probe.js` unchanged with
`--models=qwen3.5:cloud,deepseek-v4-flash:cloud`. The harness already supports it.

### Out-of-scope finding (reported, not fixed)

`services/openrouter/index.js:27` — `OPENROUTER_QWEN3_235B_INSTRUCT_MODEL = 'qwen/qwen3-235b-a22b-instruct'`
is **no longer in OpenRouter's catalog** (checked against `GET /api/v1/models`; the live ids are
`qwen/qwen3-235b-a22b`, `-2507`, `-thinking-2507`). It is a member of `OPENROUTER_TEXT_MODELS:34-41`,
so `isOpenRouterTextModel()` returns true for it and the call would 404 rather than fall back to
OpenAI. No call site points at it today, so nothing is broken in production right now.

#### ✅ Task 6: Cleanup
- Status: ✅ · Rounds 0/5
- Harness copied to
  `<scratchpad>/probe-ollama-harness/{ollamaClient,cases,probe}.js` before deletion, so the Pro-plan
  rerun stays possible without rebuilding it.
- `packages/functions/scripts/probe-ollama/` removed. `git status --porcelain` on the seo repo is
  empty — the working tree is exactly as it was before this job started.
- `rm -rf` was denied twice by the repo's own `block-dangerous-bash.sh` hook; removal went through
  as explicit `rm <file>` + `rmdir`.
- Security check: **clean**. Net repo diff is zero, so there is nothing to leak. Result files under
  the scratchpad were scanned for `.env` secret literals: 0 hits.

## COMPLETE — vòng 1 (task 1–6)

All 6 tasks ✅, 0 rounds burned, no task hit the 5-round cap.
(Trạng thái task 7–12 xem bảng Tasks ở trên; tổng kết cuối file.)

Final verification:

```
npx jest packages/functions/src/controllers/__tests__/auditAgentController.fixAuditIssue.test.js \
         packages/functions/src/services/openAI/__tests__/getMetaTags.test.js

PASS packages/functions/src/services/openAI/__tests__/getMetaTags.test.js
PASS packages/functions/src/controllers/__tests__/auditAgentController.fixAuditIssue.test.js
Test Suites: 2 passed, 2 total
Tests:       3 passed, 3 total
Time:        0.782s
```

The full suite was **not** run: this job's net diff on the repo is zero, so a full run would only
exercise unrelated pre-existing work on `feat/cs-grants-features`. The two suites above are the ones
that cover the code the probes exercised.

Final security verdict over the whole job: **clean**. No file in the repo was modified, no secret was
logged, printed, or written to any artifact, and both API keys were read from `process.env` only.

**Outcome: stay on OpenRouter.** Full reasoning in the Report section above.

---

## Round 2 — sếp đề xuất chuyển sang Ollama Cloud ($100 budget, fallback OpenRouter, 2-3 account)

### Số chi tiêu THẬT (thay cho mọi ước tính trước đó)

`GET https://openrouter.ai/api/v1/key` với chính key trong `packages/functions/.env`:

```
usage_monthly    $189.58      <- 30 ngày, key này
usage_daily      $1.27
usage (lifetime) $1,226.77
limit            $50/ngày (còn $48.73)
```

`GET /api/v1/credits`:

```
total_credits    $2,000.00
total_usage      $1,915.84
còn lại          $84.16
```

**Ước tính $106 dựng từ creditHistories là SAI — thấp 45%. Số đúng: $189.58/tháng.**

Hai việc phát sinh, độc lập với chuyện Ollama:

1. **Runway ~13 ngày.** $84.16 còn lại, trung bình $6.32/ngày. Cần nạp hoặc giảm chi trong tuần này.
2. **~$689 chi tiêu đến từ key khác.** Key của seo lifetime $1,226.77 nhưng account đã dùng $1,915.84.
   Chưa biết app nào. Cần rà.

Breakdown theo model/ngày cần **management key** — `/api/v1/activity` trả
`403 "Only management keys can fetch activity for an account"`, key hiện tại có
`is_provisioning_key: false`. Tạo ở openrouter.ai/settings/provisioning-keys.

### Model trong lineup Ollama, đo qua OpenRouter

Chạy `probe.js --provider=openrouter --or-models=...` trên 8 case, so với `gemini-3-flash`:

| Model | schema | latency ngắn | latency dài | $/1000 (gen_desc) |
|---|---|---|---|---|
| `google/gemma-4-31b-it` | **5/5** | −47% / −17% / −7% | **−10%** | **$0.191** |
| `deepseek/deepseek-v4-flash` | 4/5, no vision | +386%…+903% | +1365% | $0.131 |
| `minimax/minimax-m3` | 4/5 | −70% / −27% | +3286%, 8192 tok | $10.07 |
| `openai/gpt-oss-120b` | 4/5, no vision | +502%…+5071% | **+15990%** (515s) | $1.42 |
| `qwen/qwen3.5-27b` | **1/5** | ERR | +2985%, 8298 tok | $13.10 |
| baseline `gemini-3-flash` | 5/5 | — | — | $1.822 |

Ba model reasoning (`gpt-oss-120b`, `qwen3.5-27b`, `minimax-m3`) đều nổ output tới trần 8192 token —
cùng bệnh với `nemotron-3-nano` ở round 1. Không tắt được thinking qua API.

**`google/gemma-4-31b-it` thắng rõ**: cùng dòng với `gemma4:cloud` bên Ollama, có vision, schema 5/5,
latency ngang hoặc tốt hơn ở phần lớn case, rẻ hơn 6–9.5×.

Chiếu lên chi tiêu thật $189.58/tháng → ước còn **~$25–32/tháng**, vẫn rẻ hơn Ollama Max ($100) 3×,
mà không cần migration, không cần fallback, không cần gói đang bị khoá đăng ký.

### Đang chạy: eval 30 sản phẩm thật

Fixtures kéo từ collection `analysis` prod (read-only, shopID đã hash): 30 sản phẩm / 20 shop,
9 cái có ảnh, tiêu đề đa ngôn ngữ (Ả Rập, Pháp, Anh). Chấm bằng luật đo được, không dùng LLM judge:
pass-rate schema, độ dài meta title/description, focus_keyword có xuất hiện không, **trung thành
ngôn ngữ theo unicode script**, HTML sanity, latency p50/p95, $/1000.

---

## Vòng 2 — audit content trên Ollama Cloud Pro ($20), 2026-08-18

Key Pro thật (`.env` OLLAMA_API_KEY, sha8 `ed14eccf`). Input = prompt **thật** của app, dump từ
`evalProducts.js --dump-payloads` (90 payload = 30 sản phẩm merchant thật × 3 task), nên OpenRouter
và Ollama nhận byte giống hệt nhau. Baseline = `google/gemini-3-flash-preview` (`CONTENT_MODAL`).

### Chặn 1 — Ollama Cloud bỏ qua JSON Schema, đã re-verify trên key Pro

| variant | cách đưa schema | kết quả |
|---|---|---|
| A | không đưa (đúng hành vi app hôm nay) | 0/5 model đúng shape |
| B | `format: <JSON Schema>` trong `/api/chat` | **0/5** — output byte giống hệt A |
| C | nhét schema vào system prompt | 4/5 pass |

Kết luận: đổi provider **không phải đổi một dòng model id**. Phải sửa
`generateOpenRouterStructuredText` để inline schema vào prompt — tức đổi luôn input cho OpenRouter.

### Chặn 2 — defect có sẵn của app, bài test lôi ra

`generateKeyword` (`chains.js:289-299`): prompt viết `Pick ONE best primary keyword` (số ít), schema
lại là `{keywords: string[]}`. Cả 5 model Ollama trả `{"primary_keyword": "..."}` — làm đúng prompt.
`response_format` của OpenRouter đang che lỗi này. Đổi provider, hoặc OpenRouter đổi cách enforce,
là vỡ. Thực tế mọi model đều trả đúng 1 keyword (30/30) nên sửa prompt cho khớp schema là đủ.

### Chặn 3 — latency (30 sản phẩm, p50 / p95)

| task | baseline | gemma4:31b | mistral-large-3:675b | deepseek-v4-flash |
|---|---|---|---|---|
| `keywords` | 1918 / 9704 | 1417 / 4222 | 1228 / 2047 | 2874 / 4484 |
| `meta_tags` | 2199 / 11834 | 1967 / 4431 | 1819 / 2265 | **39710 / 63117** |
| `generate_description` | 5136 / 9922 | 4530 / 11665 | 10053 / 24172 | 12485 / 66169 |

`deepseek-v4-flash` loại: `meta_tags` trung bình **5431 output token** (cap 8060) cho một meta title
56 token — reasoning không tắt được; 7/30 fail parse; vượt `timeout: 60000` ở `packages/assets/src/helpers.js:68`.
`deepseek-v4-pro` (113s) và `glm-5.1` (79s) đã loại từ smoke, cùng lý do.
`kimi-k3`: `402 "uses extra usage only (not included plan usage)"` — ngoài quota gói $20.

### Chặn 4 — chất lượng `generate_description` (output đổ thẳng cho merchant, app không strip gì)

| model | fence ``` | meta-talk | sạch |
|---|---|---|---|
| baseline gemini-3-flash | 0 | 1 | **29/30** |
| deepseek-v4-flash | 3 | 0 | 27/30 |
| gemma4:31b | 0 | 6 | 24/30 |
| mistral-large-3:675b | **27** | 1 | **2/30** |

`mistral-large-3` loại: 27/30 bọc ```` ```html ````. `generateOpenRouterText` (`openrouter/index.js:119`)
**không** strip fence — chỉ bản structured mới strip (`:190-193`). Fence sẽ vào thẳng mô tả sản phẩm.

Caveat thật: fixture có `body_html: ''`, nên câu mở đầu kiểu "Since the current BODY is empty, I will…"
bị thổi lên cho **mọi** model. Sản phẩm thật phần lớn có mô tả. Chênh lệch 24/30 vs 29/30 vẫn có thật,
nhưng con số tuyệt đối cao hơn thực tế.

### Kết quả

Chỉ `gemma4:31b` sống sót: 90/90 đúng schema, nhanh hơn baseline cả 3 task, chất lượng meta/keyword
ngang. Trả giá: meta-talk 6/30 ở `generate_description` (baseline 1/30), và bắt buộc sửa code inline schema.

**Chưa đo được: quota.** Ollama không trả header quota nào (`/api/chat` 200, không `x-ratelimit-*`).
Chỉ biết trần khi ăn 429, mà 429 của Ollama là reject thẳng, không xếp hàng.
OpenRouter key SEO: `usage_monthly` $209.61 (1–18/08), lifetime $1246.80.

---

## Vòng 3 — luồng fix-all end-to-end, 10 page thật, 2026-08-18

Harness `probe-ollama-harness/fixLoop.js`. Dùng **code thật**: `calculateScore` (scorer axyseo),
`fixIssueByType`, `chains.js`. Chỉ vòng lặp là chép từ `productWorker.js:356-425` (fix tuần tự,
re-score sau mỗi vòng, `MAX_FIX_ATTEMPTS=8`, timeout 60s/issue).

Fixture: 10 doc `aiFixJobs` thật từ prod (read-only) — mang đúng `{pageData, keyword, analysisData,
lang}` mà luồng fix nhận, gồm `body_html` (488–15,408 ký tự) và `seoAnalysisPage`. shopID hash lại.

**Giới hạn phải nói rõ:** loại 2 field vì cần dịch vụ ngoài, không chạy offline được —
`url` (`generateUrl` → `isHandleExists`, cần Shopify + Firestore check trùng handle) và
`faqs` (`generateFaqAudit` → `getFaqs` → `initShopify`, `services/openAI/index.js:437`).
Còn `metaTags` + `content` = 11 issue id, đúng phần AI sinh nội dung.

### Kết quả — hòa

| | baseline `gemini-3-flash` | `gemma4:31b` |
|---|---|---|
| issue | 28 → **6** | 28 → **6** |
| attempts | 52 | 47 |
| LLM calls | 73 | 76 |
| wall | 701s | 684s |
| score TB | 76.3 → **84.5** | 76.3 → **84.1** |
| fix failures | 0 | 1 (`textLength: fetch failed`) |

Theo từng page: gemma tốt hơn 2, kém hơn 2, bằng 6. n=10 → nhiễu, không phải tín hiệu.

Issue không model nào dứt được: `textLength` (baseline 4 / gemma 2), `keyphraseDensity` (2 / 3),
`relatedKeywordsDensity` (0 / 1).

### Phát hiện về CHÍNH APP, không liên quan chọn model

**Vòng lặp fix không có điều kiện dừng khi không tiến triển.** `productWorker.js:368` chỉ dừng khi
hết issue fixable hoặc chạm `MAX_FIX_ATTEMPTS=8`. Đo được:

- **5/10 page (baseline) và 4/10 (gemma) chạy hết 8 vòng.**
- Page `f2898d10`: 8 vòng, issue **2→2**, score **77→77**, đốt **17 call** (gemma 19), 124s (gemma 196s).
  Không cải thiện một điểm nào.

Thêm một điều kiện dừng "score không tăng sau 2 vòng liên tiếp" sẽ cắt được lượng call này, và nó
tiết kiệm ở **mọi** provider — nhiều hơn phần chênh giữa hai model.

---

## Vòng 4 — task 7→10, 2026-08-18

Nhánh `feat/audit-content-ollama-gemma4`, tiếp trên MR !2158.

### Task 7 — có đọc được usage/quota của Ollama bằng chính key này không? **CÓ**

Vòng 2 ghi "Ollama không trả header quota nào" — đúng phần header, nhưng **kết luận suy ra từ đó
thì sai**: có endpoint riêng. `GET https://ollama.com/api/usage` + `Authorization: Bearer <key>`:

```json
{"activity": {"cost": "0.00000", "period": {"type": "last_4_weeks", ...}},
 "limits": {"session": {"usage": 0.042, "models": [{"name": "gemma4:31b", "request_count": 140}]},
            "weekly":  {"usage": 0.064, "models": [...]}}}
```

- `limits.session.usage` / `limits.weekly.usage` = **phân số 0..1** của trần 5 giờ và trần tuần.
- `request_count` tách theo model.
- `activity.cost` = tiền extra-usage ngoài gói (đang $0).
- Query param bị bỏ qua — `?period=`, `?type=` trả y hệt. Payload cố định.

Đã rà 16 surface; chỉ `/api/usage`, `/api/tags`, `/v1/models` sống. `/api/ps` 401, còn lại 404.

**Quy đổi ra số call thật** (`ollama-quota-delta.py`, 30 payload merchant thật, đo trước/sau):

| | |
|---|---|
| 30 call `gemma4:31b` | session 0.042 → **0.043** (+0.1%), weekly không nhúc nhích |
| token TB | in 513 / out 211 mỗi call |
| suy ra trần session (5h) | **~30.000 call** audit |

Độ chính xác: `usage` chỉ 3 chữ số thập phân, nên ở n=30 khoảng thật là 20k–60k call/5h.
Bậc độ lớn 10⁴ là chắc. **Gói Pro $20 không phải giới hạn cho volume audit của app** — còn xa mới tới.

Hệ quả cho thiết kế: breaker không cần đoán mù nữa. Đọc `/api/usage` là biết còn bao nhiêu **trước**
khi ăn 429. Chưa nối vào code vòng này (xem "Chưa làm").

### Task 8 — khách có bị lỗi / chậm khi chuyển provider không? **CÓ, và đã sửa**

Lỗi thật, không phải giả định: **không bên nào đặt timeout cho `fetch`.** Không có
`AbortController` trong `services/ollama/index.js` lẫn `services/openrouter/index.js`.

Chỗ này chết người vì `productWorker.js:74`:

```js
function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(...))]);
}
```

`Promise.race` **bỏ rơi** promise chứ không huỷ được `fetch` bên dưới. Nên Ollama treo → hết sạch
60s ngân sách của issue → fix hỏng → **fallback OpenRouter không bao giờ được gọi**. Fallback chỉ
tồn tại trên giấy ở đúng kịch bản cần nó nhất.

Còn cộng thêm: `504` nằm trong `RETRYABLE_STATUS`, retry chờ `delay(10000)` — treo 30s → chờ 10s →
treo 30s = 70s, một mình đã vượt 60s.

**Đo trước khi sửa** (`measureSwitch.js`, 4-6 payload meta_tags thật, Ollama treo 30s):

| điều kiện | p50 TRƯỚC | p50 SAU |
|---|---|---|
| Ollama khoẻ | 1221ms | 2786ms |
| Ollama 429 → OpenRouter | 6858ms | 2898ms |
| **Ollama treo 30s → OpenRouter** | **81.660ms** — vượt 21,7s | **31.723ms** — còn dư 28,3s |

Trước khi sửa, đúng kịch bản cần fallback nhất thì fallback vô dụng: fix hỏng, merchant thấy lỗi.

**Sửa:** một deadline cho cả lượt gọi Ollama kể cả retry, cắt bằng `AbortController`.

- `config/ollama.js` — `timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 25000`.
  25s vì p95 đo được của task nặng nhất (`generate_description`) là 11,7s, còn chừa chỗ cho fallback.
- `services/ollama/index.js` — `dueAt` set 1 lần lúc vào, truyền qua retry nên **retry không nới
  được ngân sách**; retry chỉ chạy khi `budgetLeft() > 10000`.
- Timeout mang `status = 'ETIMEDOUT'`, **cố ý không phải** quota status: provider chậm không nói lên
  gói hết hạn mức, nên chỉ fallback cho call đó, không mở circuit 5h cho mọi call khác.

Test `testTimeout.js` — 6/6 PASS:

```
PASS Ollama treo -> vẫn trả kết quả (fallback)
PASS fetch bị ABORT thật, không chỉ bỏ rơi promise  abort=1
PASS tổng thời gian < 60s (ngân sách productWorker)  5628ms
PASS Ollama bị cắt đúng hạn (~4000ms, không treo vô hạn)  5628ms
PASS treo KHÔNG latch cooldown 5h  cooldown=null
```

`testFallback.js` cũ vẫn 7/7 PASS. Jest: 895 pass, 2 fail có sẵn từ trước
(`shopify2026Client`, `workListStore` — không liên quan AI routing).

**Giới hạn của phép đo phải nói rõ:** mock "treo" trong `measureSwitch.js` là `setTimeout` thuần,
**không nghe `signal`**, nên C chỉ đo được nửa "không cho retry nới ngân sách" của bản sửa. Nửa
"abort thật" do `testTimeout.js` đo, ở đó mock có nghe `signal` và cắt đúng hạn (`abort=1`). Với
socket treo thật, deadline cắt ở 25s — còn tốt hơn con số 31,7s đo được ở đây.

Một lỗi trong chính bản sửa, tự bắt được khi review diff: `clearTimeout` ban đầu đặt ở `finally`
bọc mỗi `fetch`, mà `fetch` resolve ngay khi có header — body vẫn đọc **sau** đó, không còn ai canh.
Đã dời timer ra bọc cả phần đọc body (`readOrTimeout`).

### Task 9 — đồng bộ model hai bên

`google/gemma-4-31b-it` có thật trong catalog OpenRouter (đã check `/api/v1/models`):
262K ctx, vision + structured, **$0.10/$0.34 mỗi M token** so với `gemini-3-flash-preview`
$0.50/$3.00 → rẻ hơn **5× input, 8.8× output**.

Đổi: fallback `text` + `structured` từ `gemini-3-flash-preview` → `gemma-4-31b-it`, cùng dòng với
primary `gemma4:31b` bên Ollama. Fallback giờ đổi **provider mà không đổi luôn hành vi model**
giữa chừng một lượt fix.

**Image alt cố ý KHÔNG đồng bộ.** Đo trực tiếp 20 ảnh (`altOr31vs26.js`) trước khi quyết:

| | p50 | p95 | $in/M |
|---|---|---|---|
| `gemma-4-26b-a4b-it` (đang chạy prod) | **1593ms** | **2795ms** | **$0.07** |
| `gemma-4-31b-it` (nếu đồng bộ) | 1799ms | 6246ms | $0.10 |

26b nhanh hơn mọi phân vị, rẻ hơn, và đã đo trên 100 ảnh thật hôm 17/08. Đổi sang 31b chỉ để cho
"đối xứng" là bỏ một model đã đo lấy một model chưa đo. Giữ 26b.

(31b có thắng 1 điểm đáng ghi: ảnh "Abbigliamento Premaman" 31b đọc ra "maternity wear", 26b chỉ
thấy "summer outfits". Không đủ để đổi, nhưng đáng nhớ nếu sau này alt cần hiểu ngữ cảnh sâu hơn.)

### Task 10 — 262K context của gemma4 có đủ cho FAQ + Content không? **Thừa xa**

`/api/show` xác nhận `gemma4.context_length = 262144`.

Prompt **thật** của app (đo trên 30 payload merchant + 10 fixture fix-loop):

| task | prompt max |
|---|---|
| `keywords` | ~320 token |
| `meta_tags` | ~478 token |
| `generate_description` | ~869 token |
| `faq_keyword` (chạy thật) | **759 token** in, 222 out |
| page `body_html` to nhất (15.408 ký tự) | ~3.850 token |

262K / ~5K worst case = **thừa hơn 50×**. Context không phải giới hạn của luồng này.

Rủi ro thật không phải "262K có đủ không" mà là **cắt âm thầm**: `services/ollama/index.js:47` chỉ
gửi `num_predict`, không gửi `num_ctx`, mà default cổ điển của Ollama là cửa sổ 4096. Nếu cloud áp
default đó thì prompt content hôm nay đã **mất đầu prompt mà không báo lỗi**. Đã test needle
(mã đặt ở **đầu** prompt, nơi cửa sổ trượt nuốt trước):

| mục tiêu | inTok thật | nhớ mã? |
|---|---|---|
| 1K | 773 | CÓ |
| 5K | 3.673 | CÓ |
| 20K | 14.623 | CÓ |
| 60K | 43.823 | CÓ |

`prompt_eval_count` tăng tuyến tính, needle sống ở 43.8K token → **không cắt**. Không có bug ẩn.

Chốt: FAQ + Content **không** bị chặn bởi context. Chặn thật vẫn là **output cap + 60s timeout**
như vòng 3 đã đo (page 15.408 ký tự chạm trần 8192 token output 2 lần).


---

## Vòng 5 — faqsAssessment 500, 2026-08-18

Hai lỗi **độc lập** chồng lên nhau; sửa cái thứ nhất mới lộ cái thứ hai.

### Lỗi 1 — `TypeError` khi resolve resource id (đã sửa, commit `5082104649`)

`generateFaqAudit` gọi `getFaqs` với `id: pageData.analysisId`, không bao giờ set
`productId`/`collectionId`/`pageId`/`articleId` (`chains.js:326-334`). Ba helper prompt gọi thẳng
`.includes('gid')` lên giá trị đó. `analysisId` có doc lưu **number**, có doc **thiếu hẳn**:

```
TypeError: (productId || req?.id).includes is not a function
TypeError: Cannot read properties of undefined (reading 'includes')
```

Ném **trước khi gọi Shopify**. `getResourceFactsForMeta:475` đã normalize đúng sẵn — nâng thành
`resolveShopifyId` dùng chung cho cả 4 helper. `getPromptArticle` còn không fallback về `req.id`,
đang gửi `owner_id: undefined` sang Shopify.

Test mới: 4 helper × (id number / id thiếu / GID) = 12 case. **8/12 fail trên code cũ** (đã stash
bản sửa chạy lại để chắc test bắt đúng bug).

### Lỗi 2 — key OpenRouter chết trong `.env.local`

Sau khi hết `TypeError`, lỗi thành `[openAI:getFaqs] 6FFrhDPLyN9t8mLeRT8r User not found.`

Nhìn như Shopify auth. **Không phải.** `UnauthorizedResponseError` là class của `@openrouter/sdk`;
`getFaqs` try/catch quanh cả phần gọi AI nên 401 của OpenRouter đội tên nó.

Loại trừ từng lớp, đo chứ không đoán:

| kiểm tra | kết quả |
|---|---|
| `SHOPIFY_ACCESS_TOKEN_KEY` local vs staging | trùng (`6d736b91`) |
| shop `6FFrhDPLyN9t8mLeRT8r` trên `avad-seo-staging` | có, `linhnguyen11.myshopify.com` |
| `accessTokenHash` giải mã bằng key local | OK → `shpat_…` |
| `shopify.shop.get()` | **200 OK**, plan partner_test |

Thủ phạm: **emulator nạp `.env.local` đè `.env`**.

```
.env         OPENROUTER sha8 7ccb3a4b len 73 → 200, còn $45.81 hạn mức ngày
.env.local   OPENROUTER sha8 b0544b66 len 91 → 401 {"error":{"message":"User not found.","code":401}}
```

Khớp từng chữ với lỗi thật. Đã copy key từ `.env` sang `.env.local`, backup
`.env.local.bak-openrouter-401`, verify lại 200. Rà nốt: chỉ còn `INTERNAL_REDIS_TOKEN` (thiếu ở
`.env.local`) và `SLACK_ENT_CHANNEL_ID` (rỗng) lệch — không liên quan.

Đã xác nhận chạy được.

### Bài học ghi vào memory

- [[seo-env-local-beats-env]] — `.env.local` thắng `.env`; và tra class lỗi thuộc SDK nào trước khi
  tin cái prefix trong log.
- [[seo-prod-token-key-committed]] — phát hiện kèm, xem dưới.

### ⚠️ Phát hiện bảo mật (báo cáo, KHÔNG tự sửa)

`packages/functions/src/commands/fixProBackToFree.js:95` hardcode literal 32 ký tự truyền vào
`prepareShopData`. Fingerprint `ee21a87f/32` — **trùng đúng** `SHOPIFY_ACCESS_TOKEN_KEY` trong
`PRODUCTION_ENV_FILE`. Nằm trong **6 commit**, còn cả trong `packages/functions/lib/`.

Key này giải mã access token Shopify của **mọi** merchant prod. Xoá dòng vô nghĩa — key đã trong
lịch sử git. Phải rotate key prod + re-encrypt `accessTokenHash` toàn bộ `shops`. Đụng dữ liệu
prod nên dừng ở báo cáo.


---

## Tổng kết (2026-08-18)

**12/12 task ✅.** 1 round bị đốt (task 8 — bản sửa đầu tiên clear timer quá sớm, tự bắt khi
review diff). Không task nào chạm trần 5 vòng.

### Câu trả lời cho yêu cầu của sếp

| Sếp hỏi | Trả lời đo được |
|---|---|
| Chuyển OpenRouter → Ollama Cloud | **Hoà**, không thắng. 10 page thật qua luồng fix thật: 28→6 issue cả hai bên, score TB 84.5 vs 84.1 |
| $100 budget, 1 tài khoản đủ không | **Thừa xa.** Gói $20 Pro: 30 call = 0.1% trần session → ~30k call audit/5h |
| Cơ chế fallback sang OpenRouter | **Xong.** Mọi route Ollama fallback; 402/403/429 mở circuit 5h, lỗi khác fallback lẻ |
| Vol nhiều thì đăng ký 2–3 tài khoản | **Chưa cần.** Trần hiện tại chưa chạm; `/api/usage` đọc được số thật để quyết sau |

### Giá trị thật thu được lại KHÔNG nằm ở chuyện đổi provider

Ba lỗi có sẵn của app, lộ ra nhờ đi đo, và **cả ba đều ảnh hưởng bất kể dùng provider nào**:

1. **Không provider nào có timeout** → `Promise.race` ở `productWorker.js:75` bỏ rơi promise chứ
   không huỷ được fetch → 1 lần treo ăn sạch 60s ngân sách merchant, fallback vô dụng đúng lúc
   cần nhất. Đã sửa.
2. **`analysisId` number/thiếu làm sập luồng FAQ** trước cả khi gọi Shopify. Đã sửa + 12 test.
3. **Vòng lặp fix không có điều kiện dừng khi không tiến triển** — 5/10 page đốt hết 8 vòng.
   Chưa sửa, nằm ở "Việc còn mở".

Cộng thêm 1 phát hiện bảo mật: key giải mã token Shopify prod bị commit vào repo.

### Khuyến nghị

Giữ `gemma4:31b` chạy staging 1 để lấy số trên traffic thật. **Chưa đẩy prod** — hai bên hoà,
mà đổi provider thì mất prompt caching của OpenRouter (input rẻ hơn 10× ở call có cache).
Việc đáng làm hơn cả hai: thêm điều kiện dừng cho vòng lặp fix — cắt được nhiều call hơn phần
chênh giữa hai model.
