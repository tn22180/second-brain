---
name: openclaw-ollama-cloud-setup
description: OpenClaw on this Mac runs on ollama-cloud provider; node engine pin and where the key comes from
metadata:
  type: project
---

OpenClaw (brew global, `/opt/homebrew/lib/node_modules/openclaw`) chạy bằng provider
`ollama-cloud` (native `/api/chat` tới https://ollama.com), KHÔNG phải provider `ollama` local —
daemon local chỉ có `gemma4:cloud`, không có model pull sẵn. Default model: `ollama-cloud/kimi-k3`.

Key lấy từ `OLLAMA_API_KEY` trong `projects/Falcon/seo/packages/functions/.env` (cùng key Ollama Cloud
đang dùng cho seo — xem [[credit-not-tokens]]). Nạp bằng
`openclaw models auth paste-api-key --provider ollama-cloud` (đọc key qua stdin, không để trên argv).

**Why:** engine range của openclaw là `>=22.22.3 <23 | >=24.15.0 <25 | >=25.9.0`. nvm default cũ là
v22.22.0 → lệch đúng 1 patch, mọi lệnh openclaw chết ngay ở dòng engine check. Đã `nvm alias default 22.23.2`
(2026-09-08). LaunchAgent gateway lại chạy `/opt/homebrew/bin/node` (v26.7.0) nên nó không bao giờ dính lỗi này —
CLI chết mà daemon vẫn sống là biểu hiện bình thường, không phải config hỏng.

**How to apply:** trước khi debug config openclaw, chạy `node -v` trong shell đó. Ollama Cloud key có thể
không được phép gọi `/api/embed` → memory search vẫn trỏ `openai` và báo thiếu key; hoặc tắt bằng
`openclaw config set agents.defaults.memorySearch.enabled false`, hoặc pull model embed local.

**Config (2026-09-12):** cả 20 model ollama-cloud đã nằm trong `agents.defaults.models`; primary
`kimi-k3`, fallback 6 con (glm-5.3 → deepseek-v4.1-flash → minimax-m3 → qwen3.5:397b →
kimi-k2.7-code → gpt-oss:120b). `openclaw models list` KHÔNG filter provider sẽ in ctx/input sai
(200k/text cho mọi dòng) — luôn chạy `--provider ollama-cloud` mới thấy metadata thật.
Backup: `~/.openclaw/openclaw.json.pre-fullmodels-20260912`.
