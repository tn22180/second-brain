---
name: shop-token
description: Get a LIVE Shopify Admin access token (+ shopId) for any shop of the 4 Avada apps by decrypting its stored accessTokenHash, and run READ-ONLY Admin GraphQL queries with it. Use when diagnosing a bug needs live shop data (settings, metafields, products, plan) or to confirm which app a shop belongs to. The token is a live Admin secret — never print, persist, or log it.
---

# shop-token — live Admin token + read-only GraphQL

```bash
SECRETS_DIR=./secrets node tools/shop-token.js <shop.myshopify.com> <app>
# app ∈ seo | blogs | ai-product-copy | llm-ai-search-seo
# stdout: {"shopId":"...","domain":"...","accessToken":"shpat_..."}
```

How it works: reads the app's Firestore (`$SECRETS_DIR/sa/<app>-prod-sa.json`), finds the shop
doc by `shopifyDomain`, decrypts `accessTokenHash` with the app's AES key
(`$SECRETS_DIR/sa/<app>.env` → `SHOPIFY_ACCESS_TOKEN_KEY`) — same crypto as `@avada/core`'s
`prepareShopData`, no @avada/core dependency.

## Querying (READ-ONLY — enforced)

```js
const { buildGraphqlArgs } = require("./tools/shop-token.js");
const a = buildGraphqlArgs(shop, token, "{ shop { name plan { displayName } } }");
const res = await fetch(a.url, { method: "POST", headers: a.headers, body: a.body });
```

`buildGraphqlArgs` PARSES the document with graphql-js and throws `MUTATION_FORBIDDEN` for
anything that isn't purely query operations (mutations, subscriptions, unparseable input —
all fail closed). Don't try to work around it; the bot must never write to a live shop.

## Rules & gotchas

- Use the token **in-process only**: fetch → use the response. Never echo the token into
  chat/prompt/log/file. In diagnose evidence, include only the GraphQL RESPONSE.
- A failed lookup/query is not fatal to a diagnosis — degrade and cap confidence at medium
  (no live verification ⇒ no auto-fix).
- Shop docs key by `shopifyDomain`; pass the `*.myshopify.com` domain, not a custom domain.
- API version pinned in the tool (matches the apps' own scripts).

> In the bot container the repo root is `/app` — prefix tool paths accordingly (e.g. `node /app/tools/…`); `SECRETS_DIR` is already `/secrets` there.
