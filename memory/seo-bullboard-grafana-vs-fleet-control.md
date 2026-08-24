---
name: seo-bullboard-grafana-vs-fleet-control
description: Bull Board đọc CÙNG Redis/BullMQ với fleet-control (trùng data, nhưng có quyền ghi); Grafana chỉ đọc Loki. Cả hai đã khoá về 127.0.0.1 ngày 2026-08-24.
metadata:
  type: project
---

`seo-bullboard`, `seo-grafana`, `seo-loki`, `seo-redis` và fleet-control (:3900, host systemd)
chạy **chung một máy** `100.87.235.36`.

**Bull Board = trùng data với fleet-control.** Container `seo-bullboard` là chính image worker
chạy `node dashboard.mjs`, nối `redis:6379` = container `seo-redis`. Cùng key
`bull:worker-<tier>:*` mà `fleet-control/core/fleet.mjs:186` đọc. Khác biệt quan trọng:

- `worker-sdk/src/dashboard/server.js:71` gọi `new BullMQAdapter(q)` **không set `readOnlyMode`**
  → Bull Board có **quyền ghi**: retry / remove / promote / pause / clean.
- fleet-control API **read-only**, endpoint ghi duy nhất là `POST /api/enroll`.
- fleet-control redact payload (`scrubSecrets`, `SENSITIVE_KEYS`); Bull Board dump thô.

→ Không bỏ Bull Board được cho tới khi fleet-control có job actions.

**Grafana ≠ nguồn job.** Datasource duy nhất là Loki (`http://loki:3100`). Không có
promtail/alloy/vector — worker tự push qua `worker-sdk/src/logging/lokiShipper.js`
(`LOKI_URL` trong compose). Label: `app, env, job, level, service_name, workerId`. Đây là
application log, khác hẳn `bull:...:logs` mà fleet-control đọc. Bỏ Grafana = mất UI duy nhất
đọc Loki.

**2026-08-24:** bind đổi `0.0.0.0` → `127.0.0.1` cho cả 3800 (bullboard) và 3030 (grafana) trong
`/home/avada/Projects/seo-worker/docker-compose.yml`. Public `seo.bullboard.minhdevtree.tech` /
`seo.grafana.minhdevtree.tech` giờ trả 502; tailnet refused; BE vẫn sống. Vào qua
`ssh -N -L 3800:127.0.0.1:3800 -L 3030:127.0.0.1:3030 avada@100.87.235.36`.

⚠️ `seo/packages/functions/compose.central.yml` **vẫn còn `0.0.0.0`** — playbook
`packages/functions/fleet/deploy-central.yml:14` chạy `docker compose -f compose.central.yml`,
chạy là mở lại lỗ.

⚠️ Đừng đụng `seoworker.minhdevtree.tech` — endpoint Redis TLS, staging4 worker còn dùng.

Liên quan: [[seo-central-box-access]], [[fleet-control-public-hosting]]
