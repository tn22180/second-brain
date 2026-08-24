---
name: seo-central-box-access
description: central-prod box thật = avada@100.87.235.36, fleet-control ở /home/avada/fleet-control — deploy.sh commit sẵn 2 default SAI
metadata:
  type: project
---

`fleet-control/deploy/deploy.sh` có 2 default **sai, đang nằm trong repo**:

| | script default | thật (verify 2026-08-22) |
|---|---|---|
| `BOX` | `avada@100.113.50.9` | `avada@100.87.235.36` — IP cũ connect timeout |
| `DEST` | `/home/avada/seo-worker/fleet-control` | `/home/avada/fleet-control` (`systemctl show seo-fleet-control -p WorkingDirectory`) |

Chạy `deploy.sh` trần = treo 15s rồi chết. Phải override cả hai.

Node Tailscale tên `seo-worker-central-prod`. Cùng máy đó: LAN `192.168.10.149` (doc
`SERVER-INFRASTRUCTURE.md` ghi `192.168.1.162` — đã lỗi thời), WireGuard `10.0.0.2`.

- **SSH key auth OK** từ Mac, không cần `SSHPASS`.
- **`sudo` đòi password** (`sudo -n` fail) → bước `systemctl restart seo-fleet-control` phải
  Tony tự chạy `ssh -t ... 'sudo systemctl restart seo-fleet-control'`. Không đặt password lên
  command line.
- Env service đọc từ `/etc/seo-fleet-control.env` (systemd `EnvironmentFile`, `ignore_errors=yes`,
  0600 root) — user `avada` không grep được, cần sudo mới verify được key Slack/digest.
- Compose của docker ở `/home/avada/Projects/seo-worker/docker-compose.yml` — **không git-tracked**,
  151 dòng, khác `seo/packages/functions/compose.central.yml` (114 dòng).

Liên quan: [[seo-fleet-tailscale-staging4]], [[fleet-control-public-hosting]],
[[seo-bullboard-grafana-vs-fleet-control]]
