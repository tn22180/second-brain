---
name: fleet-control-public-hosting
description: "fleet-control exposed to the team at fleet.tuannv-dev.site via Cloudflare Tunnel + Access (Google/OTP) — topology, config paths, the gotchas."
metadata: 
  node_type: memory
  type: reference
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-08-14T08:38:22.531Z
---

Set up 2026-08-14 so team can view fleet-control over a public URL (before: local only).

**Topology** — nothing public-facing on central, no open ports:
```
browser → https://fleet.tuannv-dev.site → Cloudflare edge (Access: Google/OTP, policy allow tuannv@avadagroup.com)
        → cloudflared tunnel (outbound-only) → cloudflared@central → 127.0.0.1:3900 (bun seo-fleet-control)
```
Process **stays on central** (`100.87.235.36`) — it needs redis localhost + `FLEET_DIR` filesystem, can't relocate. VM/Caddy/oauth2-proxy all dropped once the domain turned out to be on Cloudflare — cloudflared is outbound-only so central needs no inbound port.

**Configs:**
- Tunnel `fleet`, UUID `bcc1d931-b9f7-49c5-bc47-a0e84fc6a0f6`. Config at **`/etc/cloudflared/config.yml`** + creds json — NOT `~/.cloudflared`. `sudo cloudflared service install` runs as root and only reads `/etc/cloudflared` + `/root/.cloudflared`; a config under `/home/avada/.cloudflared` gives "Cannot determine default configuration path". `cloudflared tunnel route dns` however runs as the avada user (uses `~/.cloudflared/cert.pem`), no sudo.
- ingress: `fleet.tuannv-dev.site → http://127.0.0.1:3900`, else `http_status:404`. WebSocket `/ws/fleet` passes through the tunnel transparently, no extra config.
- Cloudflare Access app on `fleet.tuannv-dev.site`, policy `Allow → Emails → tuannv@avadagroup.com` (widen to `Emails ending in @avadagroup.com` for the whole team). Google IdP needs a self-made Google Cloud OAuth client (redirect `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`); **One-time PIN** is the zero-config fallback (built-in email code).
- **REDIS_PORT=6380**, not 6379 — the `seo-redis` docker container maps `0.0.0.0:6380->6379`, so the host (where fleet-control runs) reaches redis on 6380. Hitting 6379 on the host = "Connection refused". redis needs `-a $REDIS_PASSWORD`; load it from the env file, never on argv.
- App basic-auth **removed** (`WORKER_DASHBOARD_PASSWORD` commented out) — Access is the sole auth. To stop tailnet peers hitting the still-`*:3900` bun unauth: `sudo ufw deny in on tailscale0 to any port 3900` (loopback via `lo` stays open for cloudflared). Tighter alt = bind loopback: `server.mjs` `Bun.serve({..., hostname:'127.0.0.1'})`.
- `FLEET_ENROLL_TOKEN` left unset → `/api/enroll` returns 503.

SSH into central to run any of this hit the ACL trap — see [[seo-fleet-tailscale-acl-autodeploy]] gotcha 3. Related: [[seo-fleet-tailscale-staging4]], [[seo-redis-command-timeout-noise]].
