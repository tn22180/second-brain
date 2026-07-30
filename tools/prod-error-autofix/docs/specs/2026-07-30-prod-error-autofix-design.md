# Thiết kế — `prod-error-autofix`

Ngày: 2026-07-30
Trạng thái: Đã duyệt (thiết kế), chờ triển khai
Brief gốc: `jobs/product-error-auto-fix.md`

## Vấn đề

Channel Slack `#prod-errors` đã nhận alert từ cả 5 app prod (lib `avada-prod-error-alert`, rollout
2026-07-22). Nhưng alert chỉ là thông báo — mỗi lần có message mới vẫn phải có người ngồi xuống,
đoán app nào, mở Logs Explorer, tìm handler, đọc code, sửa, chạy test, mở MR. Vụ triage
`jobs/bugprod.md` (11 endpoint 5xx của BLOG) mất trọn một session cho **một** app trong **một** ngày.

Ba thứ làm việc đó đắt:

- **Đoán từ code là sai.** Trong `bugprod.md`, static analysis đoán sai 4/7 endpoint; chỉ khi đọc
  257 request log + 1592 dòng app error mới chốt được root cause thật. Bất cứ agent nào fix mà
  không đọc log sẽ tạo MR sai.
- **Context bị đốt lại từ đầu mỗi lần.** Route map, gen1/gen2, logger behavior, prod env của từng
  app — agent phải khám phá lại mỗi session dù lần trước đã tìm ra.
- **Alert lặp lại nhiều ngày.** Fix chưa merge/deploy thì lỗi vẫn bắn. Nếu không xử lý trạng thái,
  mỗi lần bắn lại là một MR trùng.

## Mục tiêu

Một daemon chạy trên máy local của Tuan: nghe channel `#prod-errors` realtime, với mỗi
**fingerprint lỗi mới** thì tự đọc log GCP, phân tích ra root cause có dẫn chứng, sửa code, viết
test reproduce, chạy smoke test, mở MR, rồi reply vào chính thread của alert đó.

Kèm một **job brain** riêng: kho kiến thức chỉ phục vụ nhiệm vụ này, để job sau không phải học lại
những gì job trước đã biết.

Không có mục tiêu: thay CI, thay review của người, tự merge, tự deploy, hay tự sửa vấn đề hạ tầng.

## Không nằm trong scope

- **Không tự merge, không tự deploy.** MR đến tay Tuan; merge và deploy vẫn thủ công.
- **Không tự fix lỗi `kind === 'infra'`.** OOM, `no available instance`, `memory limit` là quyết
  định capacity và tiền (`bugprod-mr2.md`: `api` 1GiB→2GiB nhân đôi memory tier của function busy
  nhất). Agent chỉ đo và đề xuất.
- **Không đụng working tree đang dùng.** Mọi thao tác trong worktree riêng.
- **Không bịa.** Không có log làm bằng chứng thì không có root cause; báo `inconclusive`.

## App trong scope

| `appName` trong alert | Repo | Prod project | Base branch |
|---|---|---|---|
| `SEO` | `seo` | `avada-seo` | `master` |
| `BLOG` | `blogs` | `avada-blog-app` | `master` |
| `APC` | `ai-product-copy` | `ai-product-copy` | `master` |
| `AEO` | `llm-ai-search-seo` | `seo-on-aeo` | `master` |
| `IMG-OPT` | `avada-image-optimizer` | `app-plaza-image-optimizer` | `master` |

`appName` lấy nguyên từ alert (`[BLOG]`), không suy diễn từ nội dung message. App không có trong
registry → reply vào thread nói rõ, không crash, không đoán repo.

## Vị trí và runtime

Project: `second-brain/tools/prod-error-autofix/`. Runtime Bun + TypeScript (`bun` đã có sẵn,
`fleet-control` cũng Bun). Dependency ngoài: `@slack/socket-mode`, `@slack/web-api`. SQLite dùng
`bun:sqlite` (built-in).

State và secret nằm **ngoài** git — `second-brain` sync nightly rồi push, không được nhét worktree,
log, hay token vào đó:

```
~/.cache/prod-autofix/
  .env                    SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_CHANNEL_ID
  state.db                SQLite: alerts, rate_events, baselines, cursor
  wt/<repo>-<fp>/         worktree tạm, xoá sau job (giữ lại nếu smoke fail)
  jobs/<fp>/<attempt>/    logs.json, analysis.json, jest-base.txt, jest-fix.txt, prompt.txt
```

## Kiến trúc

```
Socket Mode (message.channels)
  └─ listener        lọc channel + bot id, dedupe theo event_id, lưu cursor ts
  └─ parseAlert      blocks → {appName, service, severity, kind, snippet, count, logsUrl, projectId}
  └─ registry        appName → {repo, projectId, defaultBranch, testCmd}
  └─ fingerprint     hashId(app|service|kind|normalize(snippet))
  └─ stateMachine    new | analyzing | mr_open | awaiting_deploy | fix_failed | inconclusive | infra | blocked
  └─ rateGate        1 job song song · 5 MR/giờ · 3 MR/repo/ngày
  └─ worktree        git worktree add từ origin/<defaultBranch>
  └─ fetchLogs       gcloud logging read, cửa sổ ±15m quanh alert ts
  └─ brainSlice      CORE + patterns + apps/<app> + index (+ incident gần giống)
  └─ ANALYZE loop    ≤5 vòng, model mạnh → analysis.json
  └─ verifyCitations grep từng file:line trên disk; sai → feed lại loop
  └─ FIX             model rẻ hơn, chỉ nhận root cause đã chốt → diff + test reproduce
  └─ smoke           jest baseline(base) vs jest(sau fix), không được thêm fail
  └─ openMr          git push -o merge_request.create
  └─ reply           post vào thread_ts của alert
  └─ LEARN           ghi incidents/<fp>.md + index.md, đề xuất candidates.md
```

Mỗi unit là một file, một việc, test được độc lập. Orchestrator (`pipeline.ts`) chỉ nối chúng lại
và giữ state — không chứa logic phân tích.

## Tại sao push option, không dùng `glab` API

`glab auth status` trên máy này trả `401 Unauthorized` / `No token found`. Đúng như ghi chú trong
`jobs/bugprod.md` task 7: MR lần đó phải mở tay vì không có token. Nhưng git operations đã cấu hình
qua SSH và chạy được.

Nên MR mở bằng **GitLab push options**, không cần PAT:

```
git push -o merge_request.create \
         -o merge_request.target=master \
         -o merge_request.title="fix(prod): <root cause ngắn>" \
         -o merge_request.description="$(cat mr-body.md)" \
         -o merge_request.remove_source_branch \
         origin HEAD:fix/prod-<app>-<fp>
```

URL của MR nằm trong stderr của lệnh push (`remote: View merge request for ...`) — parse ra từ đó.
Parser này có unit test riêng vì nó là điểm duy nhất biết MR đã mở thành công hay chưa.

## Fingerprint — copy, không import

Lib `avada-prod-error-alert` publish trên npm public (`0.1.0`) nhưng `src/index.js` **chỉ** export
`createErrorAlertHandler`; `normalize`, `classify`, `hashId` không được export. Nên 3 hàm này copy
vào `src/fingerprint.ts` (khoảng 30 dòng), kèm **parity test** import trực tiếp
`projects/Falcon/avada-prod-error-alert/src/fingerprint.js` trên disk và so output trên một corpus
fixture. Drift là test fail, không phải bug âm thầm.

Không chờ republish lib mới làm được việc. Việc thêm export vào lib là follow-up rời, không block.

Fingerprint tính từ **snippet trong Slack message**, không phải từ raw log entry, nên không đảm bảo
bằng đúng `id` mà `claimErrorAlert` ghi vào Firestore. Đây là chấp nhận có ý thức: input duy nhất
mà daemon có là Slack message. Snippet đã bị cắt ở 700 ký tự (`buildSlackPayload.js:1`) và
`normalize()` chỉ lấy dòng đầu, nên trong thực tế hai bên khớp với phần lớn lỗi — nhưng spec không
được dựa vào giả định đó ở bất cứ đâu khác.

## Hai stage model riêng

| Stage | Model | Input | Output | Gate |
|---|---|---|---|---|
| ANALYZE | Opus | brain slice + logs.json + repo (worktree) | `analysis.json` | mọi citation grep ra thật trên disk |
| FIX | Sonnet | root cause đã chốt + citations | diff + test reproduce | baseline diff jest |
| LEARN | Haiku/Sonnet | analysis + kết cục job | incident md + candidate | không (chỉ ghi, không quyết) |

Lý do chia: ANALYZE là chỗ khó thật — phải nối 1592 dòng log với code và loại giả thuyết sai; đây
đúng là chỗ `bugprod.md` cho thấy model yếu sẽ chốt sai. FIX là mechanical khi root cause đã pin,
và đã có baseline jest chặn hậu.

`analysis.json` schema:

```json
{
  "rootCause": "string, một câu, bác bỏ được",
  "mechanism": "string, chuỗi nhân quả từ log tới dòng code",
  "citations": [{"file": "packages/functions/src/x.js", "line": 42, "why": "..."}],
  "evidence": [{"logQuery": "...", "matched": 54, "sample": "..."}],
  "confidence": "high|medium|low",
  "reproPlan": "string, cách viết test làm bug hiện ra",
  "fixSketch": "string",
  "isInfra": false
}
```

**Loop ANALYZE tối đa 5 vòng.** Mỗi vòng phải nộp `analysis.json` hợp schema. Sau mỗi vòng:

1. Verify từng `citations[]` — file tồn tại, dòng đó tồn tại, nội dung khớp `why`. Sai → vòng sau
   nhận danh sách citation bị bác kèm lý do.
2. Verify `evidence[]` — mỗi `logQuery` chạy lại thật bằng `gcloud logging read`, `matched` phải > 0.
   Bằng 0 → bác, ghi rõ "evidence không tái lập được".
3. `confidence: low` → vòng tiếp.

Hết 5 vòng chưa qua gate → `status=inconclusive`, reply phân tích tốt nhất kèm những gì đã bị bác,
**không** MR. Đây là kết cục hợp lệ, không phải lỗi.

CLI không có `--max-turns` (đã kiểm `cc --help`), nên mỗi lần gọi bị chặn bằng timeout wall-clock
(ANALYZE 8 phút/vòng, FIX 12 phút) và số vòng do orchestrator đếm, không do CLI.

Brain nhét vào bằng `--append-system-prompt "$(...)"` — bản CLI này không có dạng `-file`. `cwd` là
worktree nên `CLAUDE.md` và `.claude/skills/` của **đúng repo đó** tự load, không lẫn app khác.

## Job brain

Nằm **trong** git, versioned, sync cùng brain nightly:

```
tools/prod-error-autofix/brain/
  CORE.md              vai trò + luật cứng của agent job này
  patterns.md          root-cause pattern xuyên app
  apps/BLOG.md         per-app: project id, gen1/gen2, logger behavior, route→controller map,
  apps/SEO.md            prod env ở đâu, quirk đã biết, test command
  apps/APC.md
  apps/AEO.md
  apps/IMG-OPT.md
  index.md             1 dòng/incident: fp · ngày · app · service · root cause · MR · verdict
  incidents/<fp>.md    bản đầy đủ: alert raw, log evidence, citations, diff, MR, kết cục
  candidates.md        fact chưa chốt, chờ recur ≥2 job mới lên apps/*.md
```

**Luật load** — đây là toàn bộ lý do brain tồn tại:

| Luôn load | Load có điều kiện | Không bao giờ auto-load |
|---|---|---|
| `CORE.md`, `patterns.md`, `apps/<app>.md` của đúng app trong alert, `index.md` | `incidents/<fp>.md` khi trùng fingerprint, hoặc cùng `service` và `normalize()` gần giống | `incidents/*` còn lại, `apps/*` của app khác |

Ngân sách cứng **6k token/slice**. `autofix brain budget` đo và fail khi vượt — brain phình ra là
lỗi build, không phải chuyện phát hiện sau ba tháng khi job đã chậm.

**Seed từ dữ liệu thật, không viết mới.** `jobs/bugprod.md` đã có map 11 endpoint → 7 handler và 7
root cause đã xác nhận bằng log của BLOG; `jobs/bugprod-mr2.md` có `logger.error` là `console.error`
thuần nên sink `severity>=ERROR` mù hoàn toàn (1592/1592 entry không có `severity`), và
`getCompletion` truncation gây 54 trong số các 500. Đổ hết vào `apps/BLOG.md` và `patterns.md`.
Bốn app còn lại seed bằng repo scan (entry point, gen1/gen2, logger, test command) — chỉ ghi cái
đọc được từ code, không suy diễn từ BLOG sang.

**Stage LEARN** sau mỗi job:

- Ghi thẳng `incidents/<fp>.md` và một dòng `index.md`. Đây là chuyện đã xảy ra, không cần duyệt.
- Fact tổng quát hoá về app (thêm entry route map, quirk mới) → `candidates.md`. Chỉ lên
  `apps/<app>.md` khi recur ở ≥2 job khác nhau, hoặc Tuan promote tay. Giống convention
  `brain.py`: candidate không bao giờ tự động thành memory.
- MR bị close/reject → ghi verdict vào incident. Fingerprint đó lần sau load được incident cũ, agent
  thấy fix trước đã bị bác và vì sao.

## Alert lặp lại khi chưa merge/deploy

Fix chưa lên prod thì lỗi vẫn bắn — có thể nhiều ngày. Xử bằng state machine per fingerprint, và
xác định trạng thái merge/deploy **không cần GitLab token**:

- **Đã merge chưa:** `git fetch origin` rồi `git merge-base --is-ancestor <fix_sha> origin/<base>`.
  Chạy qua SSH, không cần PAT.
- **Đã deploy chưa:** `deployed_at` = thời điểm revision mới nhất của service đó trên prod project
  (`gcloud run revisions list` / `gcloud functions describe`), lấy qua gcloud auth sẵn có.

| State | Alert trùng fingerprint bắn lại | Hành động |
|---|---|---|
| `mr_open` | branch còn, chưa là ancestor của base | Reply thread mới **một dòng**: link MR đang mở, mở bao lâu rồi, "chưa merge". Không chạy lại pipeline. Không MR mới. |
| `awaiting_deploy` | đã merge, `deployed_at` < `merged_at` | Reply một dòng: "đã merge `<sha>`, prod chưa deploy revision mới". Không chạy lại. |
| `fix_failed` | đã merge **và** `merged_at < deployed_at < alert_ts` | Fix đã lên prod mà lỗi vẫn còn → **fix sai**. Chạy lại pipeline, `attempt+1`, nhét diff cũ + incident cũ vào input ANALYZE làm giả thuyết đã bị bác. Tối đa 3 attempt, sau đó `status=needs_human`. |
| `inconclusive` | — | Chạy lại **một** lần nữa nếu cách lần trước ≥24h (log mới có thể đủ hơn). Sau đó chỉ đếm. |
| `infra` | — | Chỉ đếm, reply lại tối đa 1 lần/ngày. |
| `needs_human` | — | Chỉ đếm, không reply nữa. Hiện trong `autofix status`. |

**Chống spam reply:** với mọi state không chạy pipeline, reply tối đa **1 lần / fingerprint / 24h**.
Các lần bắn còn lại chỉ tăng `recurrence_count` trong SQLite. Alert lib đã dedupe cửa sổ 10 phút
(`claimErrorAlert.js`), phần này lo cửa sổ nhiều ngày.

## Cap và dedupe

1 job song song (máy này còn chạy việc khác của Tuan). 5 MR/giờ. 3 MR/repo/ngày.

Vượt cap → **vẫn reply phân tích** vào thread, kèm một dòng nói rõ bị cap và cap nào, chỉ hoãn phần
MR. Không im lặng bỏ. Job vào queue `deferred`, `autofix status` thấy được.

## Smoke gate — baseline diff

1. Trên base commit (trước khi FIX sửa gì): chạy full jest của repo, lưu tập `{suite, test}` fail →
   `jest-base.txt`.
2. Sau FIX: chạy lại, lưu `jest-fix.txt`.
3. So sánh: chỉ cho mở MR nếu `fail(fix) \ fail(base) == ∅`, **và** test reproduce mới do FIX viết
   phải fail trên base và pass sau fix.

Cần bước baseline vì trên `blogs`, 3 suite fail sẵn trên `master` do module resolution
(`jobs/bugprod-mr.md`) — chạy jest một lần rồi kết luận sẽ báo động sai mọi lần.

Baseline cache theo `(repo, base_sha)` trong `state.db` để không chạy lại jest full cho mỗi job trên
cùng một commit.

## Xử lý lỗi

| Hỏng | Xử |
|---|---|
| Daemon chết / mất WebSocket | launchd `KeepAlive`. Lúc start, backfill `conversations.history` từ `cursor` đã lưu → không mất event. Đây là cách bù điểm yếu của Socket Mode. |
| App không có trong registry | Reply thread nói rõ, `status=unknown_app`, không đoán repo |
| `gcloud` 401 | Reply "cần `gcloud auth login`", `status=blocked`, **không** gọi model (không đốt token vào job chắc chắn thất bại) |
| jest thêm fail | Reply kèm output, **giữ worktree** để soi, không MR |
| Push bị reject | Reply stderr raw, không retry mù |
| ANALYZE trả JSON không hợp schema | Coi như một vòng thất bại, feed lỗi validate vào vòng sau |
| Worktree còn sót từ job trước | `autofix daemon` lúc start dọn worktree không có job đang chạy |

## Bảo mật

Token Slack chỉ nằm ở `~/.cache/prod-autofix/.env`, `chmod 600`, ngoài git. Không bao giờ đưa
token lên command line (transcript đọc lại được) — daemon đọc file, truyền qua env của process con.
Reply Slack không in raw log có thể chứa dữ liệu shop; chỉ in đoạn liên quan root cause.

`claude -p` chạy với `--permission-mode acceptEdits` giới hạn trong worktree (`--add-dir` chỉ
worktree). Không cấp quyền `firebase deploy`, `gcloud ... deploy`, hay push lên branch khác branch
fix của chính job đó — allowlist tool khai tường minh, không dùng `--dangerously-skip-permissions`.

## Test

Unit:

- `parseAlert` — parity với output thật của `buildSlackPayload` (dựng payload bằng chính lib rồi
  parse lại), gồm cả `kind=infra`, `totalCount>1`, message có ký tự đã escape.
- `fingerprint` — parity với `avada-prod-error-alert/src/fingerprint.js` trên corpus fixture.
- `rateGate` — biên của 3 cap, và cap không chặn phần reply.
- `smokeDiff` — comparator, gồm ca base đã fail sẵn 3 suite.
- `parseMrUrl` — stderr của push, ca thành công / không có MR / branch đã tồn tại.
- `stateMachine` — 6 nhánh alert trùng ở bảng trên, đặc biệt `fix_failed` cần đúng bộ ba
  `merged_at < deployed_at < alert_ts`.
- `brainSlice` — chọn đúng app, không rò app khác, và fail khi vượt 6k token.

Integration: event giả → pipeline với ANALYZE/FIX stub → assert worktree được tạo từ đúng base,
shape câu `git push`, và reply gửi đúng `thread_ts`.

Không post thật vào channel prod trong test — `SLACK_CHANNEL_ID` trỏ channel test.

## Harness CLI (`bin/autofix`)

| Lệnh | Việc |
|---|---|
| `autofix daemon` | Socket Mode + backfill; launchd chạy lệnh này |
| `autofix status` | queue, cap còn lại, 10 incident cuối kèm state |
| `autofix replay <fp\|ts>` | chạy lại pipeline trên alert cũ, **không** post Slack trừ khi `--post` |
| `autofix dry-run <alert.json>` | feed alert giả, in brain slice + prompt sẽ dùng, không gọi model |
| `autofix brain seed [app]` | dựng `apps/*.md` từ `jobs/bugprod*.md` + repo scan |
| `autofix brain promote <n>` | candidate → `apps/<app>.md` |
| `autofix brain budget` | đếm token slice từng app, exit code ≠ 0 khi vượt 6k |

`replay` và `dry-run` là hai lệnh làm project này calibrate được mà không phải chờ bug prod thật bắn.

## Việc phải làm tay, ngoài session

1. Slack app: bot scope `channels:history`, `channels:read`, `chat:write`; app-level token scope
   `connections:write`; Event Subscriptions bật `message.channels` (thêm `groups:history` +
   `message.groups` nếu channel private).
2. Đưa `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID` → ghi vào
   `~/.cache/prod-autofix/.env`.
3. `gcloud auth login` nếu còn 401.
4. Cài launchd plist (daemon), giống pattern `second-brain/launchd/`.
