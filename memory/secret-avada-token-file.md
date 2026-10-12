---
name: secret-avada-token-file
description: token sat_ của secret.avada.net nằm ở ~/.config/avada/secret-token; share token shop cho dev qua POST /api/secrets private
metadata:
  type: reference
---

Token `sat_` (secret.avada.net) ở `~/.config/avada/secret-token` (600), đọc inline, không export. Cùng chỗ với notes-token [[share-note-token-file]].

Share Admin token shop cho dev: `getShopToken` (falcon-bug-fix-agent/tools/shop-token.js) → `POST https://secret.avada.net/api/secrets` trong 1 process, `mode:private`, `recipientEmails:[<dev>@avadagroup.com]`, `expiresIn:1h`, `views:1`. Chỉ in url. Email Avada của Tuan: tuannv@avadagroup.com.

**Why:** token merchant là Admin sống; dán chat/terminal = vào transcript + brain git.
**How to apply:** private mode khoá theo recipient — người tạo không phải recipient thì tự mở không được.
