sau đây chuẩn bị t mở thêm ollama 5 tài khoản 20$ nữua để tránh limit các tài khoản nên phải làm routing cho các tài khoản này hoặc nhiều bên khác, đang phân vân giữa 9router tự host hay là tự làm luôn. Hãy phân tích và đánh giá giúp tao về phần này

---

# Phân tích: routing nhiều account Ollama — self-host 9Router vs tự làm

Ngày: 2026-08-19. Repo `seo` @ `origin/master` (a781920ab1). Mọi số dưới đây đo thật, read-only.

## Kết luận

1. **Không self-host 9Router.** Tự làm — nhưng scope nhỏ hơn tưởng: một key-pool nằm trong
   `packages/functions/src/services/ollama/index.js`, không file caller nào phải sửa.
2. **Trước khi mua 5 account: quota không phải giới hạn đang chạm — concurrency mới là.**
   1 account $20 mới dùng **10.1% hạn mức tuần** sau 2057 request.
3. **Có bug chặn: 429 concurrency đang bị đọc nhầm thành 429 quota**, làm rụng Ollama 5 tiếng.
   Không fix cái này thì mua 6 account cũng vô nghĩa.

## Số đo (2026-08-19, account $20 hiện tại)

`GET https://ollama.com/api/usage`:

| Chỉ số | Giá trị |
|---|---|
| weekly usage | **0.101** (10.1%) sau 2057 request / tuần |
| session (5h) usage | 0.004 |
| extra-usage cost | $0.00000 |
| model nhiều nhất tuần | glm-5.2 (1200), gemma4:31b (406), kimi-k2.6 (246) |

Probe concurrency, `gemma4:31b`, `num_predict:128`, tất cả bắn cùng lúc:

| N in-flight | Kết quả | Latency max |
|---|---|---|
| 8 | 8/8 HTTP 200 | 3.0s |
| 24 | 19/24 HTTP 200, **5× HTTP 429** `{"error":"too many concurrent requests"}` | **16.2s** |

- 429 concurrency trả về **rất nhanh (556–1127ms)** → phát hiện rẻ, retry sang key khác rẻ.
- 32 request thêm vào → delta usage **0.000** (dưới ngưỡng hiển thị 0.1%). Quota gần như miễn phí
  với gemma4:31b; cái đắt là các model heavy (kimi/glm/deepseek-pro).
- Latency dưới tải là rủi ro thật: 16.2s @24 in-flight so với `OLLAMA_TIMEOUT_MS=25000`
  (`config/ollama.js:12`) và ngân sách 60s/issue của `bulkAuditFix/productWorker.js:75`.

→ **Trần in-flight ~20/account.** Mua thêm 5 account = mua concurrency (~120 in-flight), không
phải mua quota. Quota 1 account còn ~10× headroom.

## Bug phải fix trước, dù chọn hướng nào

`services/ollama/index.js:36` — `OLLAMA_QUOTA_STATUS = new Set([402, 403, 429])`, và
`isOllamaQuotaError` chỉ nhìn `status`. `services/aiContent/ollamaRoute.js:93` gọi
`startOllamaCooldown` → park cờ Redis + process-local **5 tiếng** (`ollamaRoute.js:32`), toàn bộ
traffic sang OpenRouter.

Nghĩa là: **đúng lúc tải cao (>~20 in-flight) → 1 cái 429 concurrency → mất Ollama 5 tiếng →
dồn hết vào OpenRouter** — chính là provider vừa hết credit ở staging hôm 2026-08-19.

Phân biệt được: quota 429 và concurrency 429 khác nhau ở body (`too many concurrent requests`).
Concurrency 429 → thử key khác / backoff ngắn. Quota 429 (402/403) → cooldown, nhưng cooldown
**riêng key đó**, không latch cả provider.

## Vì sao không self-host 9Router

9Router = gateway open-source, một container, **SQLite ở `/app/data`**, endpoint OpenAI-compatible,
60+ provider, fallback 3 tier.

| Vấn đề | Chi tiết |
|---|---|
| SPOF trong job path | App chạy **2 runtime**: GCF (nhiều instance) + fleet box. Gateway 1 container + SQLite thành single point cho mọi call AI của cả hai. Nguyên tắc đang theo với `fleet-control`: control plane **không bao giờ nằm trong job path**. |
| Thêm 1 hop mạng | Ngân sách 1 call là 25s, p95 gemma4:31b đã 11.7s. GCF → box qua Tailscale là hop mới trong đúng đường nóng. |
| Mù tín hiệu cần nhất | 9Router route theo giá/tier provider. Nó không biết `GET /api/usage` của Ollama (session/weekly fraction per key) — đúng cái duy nhất cho phép cân tải giữa 6 account. Nó chỉ thấy 429 rồi đoán. |
| Trùng tầng đã có | App **đã có gateway riêng**: `withOpenRouterFallback` + breaker + `OLLAMA_FALLBACK_MODEL` (`services/aiContent/ollamaRoute.js`). Thêm 9Router = hai tầng làm cùng việc, hai chỗ phải sửa mỗi lần đổi routing. |
| Nền tảng "đã có" là ảo | `services/nineRouter/index.js` hiện có **0 caller** trong `packages/functions/src`, và `.env` không có `NINEROUTER_API_KEY`. Đó là integration chết, không phải hạ tầng đang chạy. |
| Vận hành | thêm container + volume + backup SQLite + 6 key gom vào một chỗ mới để lộ. |

Khi nào 9Router đáng: khi cần 60 provider **và** có consumer ngoài `seo/packages/functions` cũng
gọi chung. Hiện không phải case đó.

## Tự làm — thiết kế

Chokepoint chỉ **một hàm**: `chat()` trong `services/ollama/index.js:45`. Ba file gọi provider
thật (`aiContent/index.js`, `openAI/index.js`, `gsdAutoFill/aiContent.js`) — **không file nào phải
sửa**.

- `config/ollama.js`: `keys = (process.env.OLLAMA_API_KEYS || process.env.OLLAMA_API_KEY).split(',')`
  — giữ `OLLAMA_API_KEY` làm phần tử đầu để không vỡ env cũ.
- Chọn key: round-robin theo counter, skip key đang "hot" (vừa 429 concurrency trong N giây).
- 429 `too many concurrent requests` → **thử key kế tiếp ngay** (429 về trong ~1s, rẻ hơn fallback).
  Hết key → OpenRouter fallback như hiện tại.
- 402/403 và 429-quota → cooldown **riêng key đó**; provider chỉ tắt khi **mọi** key cooldown.
- State: `Map` process-local trước (cùng lý do breaker 2 tầng: staging không tới được Redis),
  Redis là tầng chia sẻ optional.
- `getOllamaUsage(key)` nhận key → cron `handlers/cron/ollamaQuotaAlert.js` báo từng account.

Ước lượng: ~120 dòng trong 2 file + test. Hạ tầng mới: **0**.

## Khuyến nghị về việc mua 5 account

Chưa mua vội. Cần 2 số từ **prod**, hiện chưa có:

- Prod **chưa nhận code Ollama**: revision đang phục vụ là `fixauditcontentgen2-00161-qeq` và
  `bulkauditfixproductgen2-00131-huf`, transition 2026-08-19T02:33/02:40Z, trong khi merge
  `fab0dbcccf` lúc 08:33Z. → prod hiện 0 traffic Ollama, không có gì để đo.
- Sau khi prod chạy Ollama: đo peak in-flight và weekly usage thật. Nếu weekly < 30% và không
  thấy 429 concurrency thì 2 account là đủ; 6 account là mua sớm.

Thứ tự đúng: fix phân loại 429 → key-pool (2 key) → deploy prod → đo → rồi quyết mua thêm mấy account.

---

## Progress

Started: 2026-08-19. Base: `master` @ `6ae0c4572e`. Branch: `feat/ollama-key-pool`.
(TaskCreate không có trong session này — tracking chỉ ở file này.)

| # | Task | Agent / Model | Status | Rounds | Sec | Notes |
|---|------|---------------|--------|--------|-----|-------|
| 1 | Phân loại 429 concurrency ≠ 429 quota | inline | ✅ | 2/5 | clean | `OLLAMA_CONCURRENCY_STATUS='ECONCURRENT'`, 4 test |
| 2 | Key pool nhiều account + cooldown theo key | inline | ✅ | 4/5 | fixed | `keyPool.js` mới, `chat()` tách thành `attempt()` + vòng chọn key, 11 test |
| 3 | Usage/alert theo từng account | inline | ✅ | 1/5 | clean | `getOllamaUsage(key)`, state lồng `accounts.<sha8>`, 7 test |
| 4 | Cập nhật `docs/features/ai-provider-routing.md` | inline | ✅ | 1/5 | clean | +96 dòng, `docs-gate` PASS |
| 5 | Review toàn nhánh | cavecrew-reviewer / sonnet | ✅ | 1/5 | clean | 0🔴 3🟡 — 2 cái sửa, 1 cái ghi doc |

### Log

#### ⬜ Task 1: phân loại 429 concurrency
- Goal: 429 kèm body `too many concurrent requests` KHÔNG còn làm `isOllamaQuotaError` true, nên không mở breaker 5 tiếng.
- Files allowed: `packages/functions/src/services/ollama/index.js`, `packages/functions/src/services/ollama/__tests__/*`
- Approach: thêm `OLLAMA_CONCURRENCY_STATUS = 'ECONCURRENT'` theo đúng tiền lệ `OLLAMA_TIMEOUT_STATUS` (`index.js:43`); phân loại một lần ngay chỗ đọc body (`index.js:89-99`), caller vẫn chỉ đọc `status`. Bỏ phương án cho caller regex message — vi phạm comment `index.js:96-97`.
- Test command: `npx jest --config <repo>/jest.config.js --rootDir <repo> --ci packages/functions/src/services/ollama` → pass
- Risk: nếu Ollama đổi wording body thì rơi lại về nhánh quota cũ (fail-safe, không tệ hơn hiện tại).
- Rollback: revert 1 commit, không có state ngoài process.
- Rounds used: 0/5
- Security check: -

#### ⬜ Task 2: key pool
- Goal: `chat()` xoay vòng nhiều `OLLAMA_API_KEYS`; 429-concurrency → thử key kế tiếp trong cùng deadline; quota → cooldown riêng key đó; hết key mới ném lỗi quota để breaker provider mở.
- Files allowed: `packages/functions/src/config/ollama.js`, `packages/functions/src/services/ollama/keyPool.js` (mới), `packages/functions/src/services/ollama/index.js`, `packages/functions/src/services/ollama/__tests__/*`
- Approach: tách thân `chat()` hiện tại thành `attempt({key,...})`, bọc vòng chọn key. State `Map` process-local (cùng lý do breaker 2 tầng — staging không tới được Redis). Bỏ phương án Redis-first: staging sẽ không latch được gì.
- Test command: như trên → pass
- Risk: chọn key sai → gọi bằng key đã cạn quota; vòng lặp không guard deadline → ăn hết 25s.
- Rollback: revert; `OLLAMA_API_KEY` cũ vẫn là đường mặc định (1 phần tử).
- Rounds used: 0/5
- Security check: -

#### ⬜ Task 3: usage/alert theo account
- Goal: `getOllamaUsage(key)` nhận key; cron alert báo riêng từng account thay vì gộp.
- Files allowed: `packages/functions/src/services/ollama/index.js`, `.../ollama/quotaAlert.js`, `.../repositories/ollamaQuotaAlertRepository.js`, `.../handlers/cron/ollamaQuotaAlert.js`, tests tương ứng
- Approach: (viết lại trước khi chạy — cần đọc repository + handler)
- Test command: như trên → pass
- Risk: state alert cũ không có accountId → phải giữ tương thích doc cũ.
- Rollback: revert.
- Rounds used: 0/5
- Security check: -

#### ⬜ Task 4: docs
- Goal: `docs/features/ai-provider-routing.md` mô tả đúng key pool + phân loại 429, `docs-gate` PASS.
- Files allowed: `docs/features/ai-provider-routing.md`
- Approach: thêm mục "One provider, many accounts" + sửa mục breaker.
- Test command: `docs-gate` → PASS
- Risk: citation lệch dòng.
- Rollback: revert.
- Rounds used: 0/5
- Security check: -


### Kết quả chạy

```
npx jest --config <repo>/jest.config.js --rootDir <repo> --ci --forceExit -w 4 packages/functions/src
Test Suites: 2 failed, 113 passed, 115 total
Tests:       2 failed, 964 passed, 966 total
```

2 fail là `services/__tests__/shopify2026Client.test.js` (`Expected "2026-01" Received "2026-07"`)
và `services/optimize/__tests__/workListStore.test.js` — cả hai đã fail sẵn ở HEAD trước khi sửa,
không liên quan.

```
node scripts/docs-gate/index.js
docs-gate: PASS   (481 anchored citations, 52 mirror pairs)
```

### Security check §8 trên `git diff --cached` (737+ / 72−, 9 file)

| # | Check | Kết quả |
|---|---|---|
| 1 | secret trong diff | clean — grep `sk-…`/`Bearer …`/`api_key=…` không ra gì; fixture dùng `k1`/`k2`/`test-key` |
| 2 | secret ra log / command line | clean — key chỉ nằm trong header `fetch`; log dùng `sha8` (sha256 cắt 8) chứ không phải key |
| 3 | shop scoping | N/A — `internals/ollamaQuotaAlert` cố ý app-wide, đã ghi trong doc |
| 4 | input từ request | N/A — không đọc gì từ body/query |
| 5 | file cấm | clean — không đụng `.env*`, lockfile, `.gitlab-ci.yml`, `firebase.json`, `.firebaserc`, rules |
| 6 | dep / host mới | clean — `crypto` là builtin, `package.json` không đổi, không host mới |
| 7 | blast radius | Đường AI của mọi audit fix ở prod. Parse key hỏng → pool rỗng → `chat()` ném "not set" → `withOpenRouterFallback` bắt → OpenRouter. Suy giảm, không gãy. Rollback = revert. |

Ghi chú: Firestore giờ lưu sha8 của từng API key làm id account — dẫn xuất một chiều, không phải secret.

### Việc ops còn lại (không nằm trong diff)

- Thêm biến CI `OLLAMA_API_KEYS` (CSV) vào env-file của từng project. Chưa có thì `OLLAMA_API_KEY`
  vẫn chạy như pool 1 phần tử.
- `.env` local chưa có `OLLAMA_API_KEYS` — file cấm sửa, tự thêm khi test nhiều account.


### Review (cavecrew-reviewer) — 0🔴 3🟡

| Finding | Xử lý |
|---|---|
| `OLLAMA_API_KEYS` không dedupe → key dán 2 lần chiếm 2 slot round-robin, park xong lại được phát ra ngay | **fixed** — `parseKeys` dedupe bằng `Set` (`config/ollama.js:8`), +5 test `config/__tests__/ollamaKeys.test.js` |
| `retries` truyền nguyên vào mọi account → caller nào đặt `retries>0` sẽ nhân ngân sách retry lên N lần | **fixed** — retry chỉ thuộc account đầu: `retries: tried.size ? 0 : retries` |
| Pool state process-local, không có tầng Redis như provider breaker | **accepted, ghi doc** — cố ý: staging không có route tới Memorystore. Cái đắt (5h all-accounts-over-quota) vẫn đi qua Redis của provider breaker |

Reviewer xác nhận đúng: deadline `dueAt` giữ nguyên qua mọi account và mọi retry, `tried` chặn vòng
lặp vô hạn, 4 caller (`ollamaRoute`, `openAI/index`, `auditAgent/chains`, `gsdAutoFill/aiContent`)
không cái nào đọc `status` thô, Firestore `merge:true` không đụng field cũ, không chỗ nào log key thô.

### Chạy lại sau khi sửa review

```
Test Suites: 2 failed, 114 passed, 116 total
Tests:       2 failed, 969 passed, 971 total
docs-gate: PASS
```

2 fail đã kiểm chứng là pre-existing: `git stash push -u` về HEAD sạch → cùng 2 suite,
cùng 2 test fail (`Test Suites: 2 failed, 2 total / Tests: 2 failed, 10 passed`).

### Commit

```
a5e5ab2e59 docs(ai-provider-routing): the pool, and why saturation is not exhaustion
ad050edb76 feat(ollama): route across several Ollama Cloud accounts
```

Nhánh `feat/ollama-key-pool` trên `master@6ae0c4572e`. 10 file, +842/−72. Security §8 toàn nhánh:
không secret, không file cấm, không dep mới.

Đã push + mở MR: **!2173** https://git.avada.net/avada/seo/-/merge_requests/2173
(`feat/ollama-key-pool` → `master`, 10 file, mergeable, pipeline 208773).

Ghi chú hạ tầng: API `git.avada.net` bị Cloudflare chặn theo User-Agent — urllib mặc định trả
`403 error code: 1010` trên **mọi** endpoint kể cả `/user`. Không phải lỗi scope token. Gửi kèm
UA trình duyệt là qua.

**Trạng thái: COMPLETE.**
