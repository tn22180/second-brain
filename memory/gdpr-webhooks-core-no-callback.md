---
name: gdpr-webhooks-core-no-callback
description: GDPR webhooks exist via @avada/core (/auth/webhook/*) in all apps but no callbacks wired → shop/redact acks 200 and deletes nothing; grep of app src shows 0 hits
metadata:
  node_type: memory
  type: project
  originSessionId: f86721a9-174e-4b38-bb6b-81a9ac66a301
  modified: 2026-09-25T07:30:59.404Z
---

`@avada/core` `shopifyAuth` (4.8.2, build/auth.js:93-95) auto-mounts `POST /auth/webhook/{shop/redact,customers/redact,customers/data_request}` behind HMAC. Security audits grepping app `src` report them "missing" — false. Real gap: seo, blogs, APC, img-optimizer, AEO pass no `afterRedactShop/afterRedactCustomer/afterRequestCustomerData` → ack 200, nothing deleted. Prod seo authgen2 logs: ~500 shop/redact per 30d (2026-09-25). Only joy wires callbacks (log-only).

**Why:** phase-4 security report (2026-09-24) flagged H2 wrongly; fix branch seo `fix/sec-p4-seo-H2` marks `redactRequestedAt`, purge still manual.
**How to apply:** check node_modules/@avada/core before claiming a webhook is missing; porting = ~1 service + 3 lines in handlers/auth.js per app.
