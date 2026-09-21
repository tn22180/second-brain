# onboarding-repos — tìm & nhớ repo local (map projectPath → máy Tech Lead)

Mục tiêu: Tech Lead KHÔNG phải sửa file config tay. AI tự tìm giúp, hỏi xác nhận, rồi nhớ lại lần sau.
Cache nằm ở `repos.local.json` (cạnh SKILL.md, **gitignored** — mỗi máy 1 bản, không phát hành).

## Khi nào chạy onboard
Ở bước 3 pipeline, với mỗi task có MR: cần biết `projectPath` (cắt từ MR URL) trỏ tới repo local nào.
Gọi `node $DIR/scripts/resolve-repos.mjs --path <projectPath>`:
- `source: "cache"` hoặc `"scan"`, `localPath` != null → dùng luôn, KHÔNG hỏi.
- `localPath: null` (`not_found`) → chạy onboard dưới đây.

## Nhịp onboard (tự tìm rộng → hỏi xác nhận → nhớ)
1. **Tự tìm giúp:** `node $DIR/scripts/resolve-repos.mjs` → xem `scanned[]` (đã quét `REVIEW_PROJECTS_ROOT`
   + các gốc phổ biến). Tìm entry có `projectPath` khớp task đang cần.
2. **Có ứng viên khớp** → hỏi anh xác nhận 1 câu: *"Repo `<projectPath>` ở `<localPath>`, đúng không?"*.
   Anh OK → lưu: `node $DIR/scripts/resolve-repos.mjs --save <projectPath> <localPath>`.
3. **Không thấy** (repo chưa clone / nằm ngoài các gốc quét) → hỏi thẳng: *"Repo `<projectPath>` nằm đâu
   trong máy anh?"* (hoặc anh set `REVIEW_PROJECTS_ROOT` trỏ thư mục chứa clone rồi quét lại). Có path →
   `--save`. Anh bảo bỏ qua / chưa clone → **skip task, ghi báo cáo cuối**, KHÔNG tự clone.
4. Lần sau gặp lại `projectPath` đó → hit cache, chạy thẳng, không hỏi.

## Sửa/xoá cache
- Anh muốn đổi path 1 repo → `--save <projectPath> <localPathMới>` (ghi đè).
- Path cũ sai/đã xoá repo → `--forget <projectPath>`.
- Xem cache + kết quả quét hiện tại → chạy `resolve-repos.mjs` không cờ.

## Ghi chú
- `resolve-repos.mjs` READ-ONLY với repo (chỉ đọc `.git/config`); chỉ ghi đúng file `repos.local.json`.
- Quét depth ≤2 nên bắt cả layout nhóm `<root>/<group>/<repo>` và subgroup `avada/blocko-team/<repo>`.
- Muốn quét nhanh/chính xác 1 chỗ: đặt env `REVIEW_PROJECTS_ROOT=/đường/dẫn` (nhiều đường ngăn bằng `:`).
