fingerprint: ujwpw9
service: authgen2
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: SEO
repo: seo
date: 2026-08-12T15:33:45.051Z
status: mr_open
attempt: 1

# SEO · authgen2 · ujwpw9

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2175

**Root cause.** Every one of the 13 authgen2 504s is a POST /auth/webhook/shop/update that entered @avada/core's vendored onShopUpdate handler, emitted its single entry log line 3–6 ms in, and then never settled — Cloud Run killed it at authGen2's un-overridden 60 s default request timeout; same cause as fingerprint 1n4avro, and there is no defect in this repo's src/ on that path.

**Mechanism.** packages/functions/src/handlers/auth.js:76 mounts shopifyAuth().routes() from @avada/core; that router owns POST /auth/webhook/shop/update, which is 1997 of the 2012 requests authgen2 served in 15:00–15:12Z (the rest: 6 theme/publish, 6 customers/redact, 3 app/uninstalled). authGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:81 with memory/region/vpc but no timeoutSeconds, so the Cloud Run default of 60 s applies — all 13 failures have latency 59.999271–60.000024 s, i.e. the limit to within 0.8 ms, and all carry userAgent Shopify-Captain-Hook. Matching each 504's request-log spanId (hex) to the stdout spanId (decimal) resolves 13 of 13 to exactly one stdout line each — 'Handling the shop update webhook <domain> <plan>', the first statement of onShopUpdate — emitted 3.0–6.6 ms after request start, followed by silence for the remaining 59.99 s. So HMAC verification passed, the handler was entered, and the hang is downstream of that log inside the vendored handler's Firestore I/O; nothing in the process logs, because the RPC is still pending when Cloud Run answers. Ruled out this window: (a) not saturation or a wedged container — one single instance (001548f7296a6d70…, alive since at least 12:00Z) served 1103 × 200 alongside the 13 × 504 in 15:03–15:10Z, mean 200-latency 0.335 s; (b) not a load spike — arrivals are flat at 138–197/min across 14:55–15:11; (c) not a cold start and not OOM — zero container-start and zero memory-limit entries for authgen2 in the window; (d) not an event-loop block — the 13 stalls start staggered across 5 m 23 s and share no common end time, and 30 other requests in 14:40–15:22Z completed slow-but-fine (5.4–47.1 s), i.e. a continuous latency tail, not one freeze; (e) not the VPC connector — packages/functions/src/config/vpcSettings.js:15 sets vpcConnectorEgressSettings 'PRIVATE_RANGES_ONLY', so googleapis traffic bypasses seo-connector; (f) not the 5 '[getMainThemeId] error HTTPError: Response code 401' stderr lines — those are the app/uninstalled path (services/uninstallationService.js:82), 3 requests in 12 min, a different endpoint that answered 200. The failures are not shop-specific: 13 distinct shops (karishma-sarees twice, 7 s apart), plans basic/professional/unlimited/shopify_plus, spanning shops with 1 delivery and shops with 132. What this window does add is the write pressure the endpoint carries: halfpeapp.myshopify.com alone sent 132 of the ~1112 shop/update deliveries in 15:03–15:10Z (11.9%, sustained ~1 every 3 s, peaking at 1/s for minutes), and onShopUpdate does a query plus two writes per delivery against that one shop doc — this repo has no dedup or debounce in front of the vendored handler.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:81` — authGen2 onRequest declares memory/region/vpc but no timeoutSeconds, so the Cloud Run 60 s default is the limit all 13 failures hit to within 0.8 ms
- `packages/functions/src/handlers/auth.js:76` — the only mount of shopifyAuth().routes() — the sole place /auth/webhook/shop/update is served, and the only point in this repo's src/ where a deadline or ack-first wrapper can sit ahead of the vendored handler
- `packages/functions/src/config/vpcSettings.js:15` — vpcConnectorEgressSettings 'PRIVATE_RANGES_ONLY' keeps googleapis egress off seo-connector, which rules out connector saturation as the stall
- `packages/functions/src/services/uninstallationService.js:82` — getMainThemeId call that produces the 5 stderr 401s in the window — the app/uninstalled path, 3 requests, not the alerting endpoint

## Evidence
- 13 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-07T15:03:00Z" AND timestamp<="2026-08-07T15:10:00Z" AND logName:"requests" AND httpRequest.status=504`
- 1103 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-07T15:03:00Z" AND timestamp<="2026-08-07T15:10:00Z" AND logName:"requests" AND httpRequest.status=200`
- 13 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-07T15:03:00Z" AND timestamp<="2026-08-07T15:12:00Z" AND logName:"stdout" AND (spanId="5297052970427037412" OR spanId="1050886558111591325" OR spanId="6217053947209465836" OR spanId="4461187861720586118" OR spanId="2293346031239646501" OR spanId="4177231999075079035" OR spanId="3261664701965469696" OR spanId="1928170653931486037" OR spanId="17062104685015585126" OR spanId="11208956225324624372" OR spanId="6937353617392334189" OR spanId="8235043601889487634" OR spanId="9606377378767292864")`
- 1997 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-07T15:00:00Z" AND timestamp<="2026-08-07T15:12:00Z" AND logName:"requests" AND httpRequest.requestUrl:"/auth/webhook/shop/update"`
- 132 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-07T15:03:00Z" AND timestamp<="2026-08-07T15:10:00Z" AND logName:"stdout" AND textPayload:"halfpeapp.myshopify.com"`
- 5 matching entries: `resource.labels.service_name="authgen2" AND timestamp>="2026-08-07T14:40:00Z" AND timestamp<="2026-08-07T15:25:00Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $6.14
- branch: `fix/prod-seo-ujwpw9`
- fix commit: `e9ea122b4025fb94a013dd3d4470cb2b0bae5711`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2175
- tests: 928 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix (suite load)

```
packages/functions/src/handlers/auth.js | 4 ++++
 1 file changed, 4 insertions(+)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
