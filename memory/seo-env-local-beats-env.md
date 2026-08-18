---
name: seo-env-local-beats-env
description: seo packages/functions/.env.local đè .env khi chạy emulator — sửa .env mà quên .env.local là chạy key cũ
metadata:
  type: project
---

`packages/functions/.env.local` **thắng** `.env` khi chạy Firebase emulator / `yarn dev`. Sửa key
trong `.env` xong mà không sửa `.env.local` thì server vẫn chạy giá trị cũ.

2026-08-18: `.env` có OPENROUTER key sống (sha8 `7ccb3a4b`), `.env.local` giữ key chết
(sha8 `b0544b66`) → mọi call AI trả `401 {"error":{"message":"User not found.","code":401}}`.

**Why:** lỗi hiện ra dưới tên hàm bọc ngoài, không phải tên provider. Ở đây log là
`[openAI:getFaqs] <shopID> User not found` vì `getFaqs` try/catch quanh cả phần gọi AI — nhìn y
như lỗi Shopify auth, thực ra `UnauthorizedResponseError` là class của `@openrouter/sdk`.

**How to apply:** trước khi debug auth 401 ở local, so fingerprint **cả hai** file:
`node -e "const f=require('fs'),d=require('dotenv'),c=require('crypto');for(const x of ['.env','.env.local'])console.log(x,c.createHash('sha1').update(d.parse(f.readFileSync(x)).OPENROUTER_API_KEY||'').digest('hex').slice(0,8))"`
Và tra class lỗi thuộc SDK nào trước khi tin cái prefix trong log.

Họ hàng: [[seo-env-avada-seo-local-override]]
