---
name: seo-follower-deploy-disk-leak
description: "deploy-followers.yml không xoá tarball /tmp và không prune image → box1 đầy 100% 09-22, deploy_worker fail câm 4 tag (allow_failure)"
metadata:
  node_type: memory
  type: project
  originSessionId: d36d6655-bf2d-424c-b379-feccae7f4bf6
  modified: 2026-09-24T09:49:00.261Z
---

`fleet/deploy-followers.yml` ship `/tmp/seo-worker-<sha>.tar.gz` (~1.1G) sang mỗi box rồi
`docker load`, nhưng **không xoá tarball và không prune image cũ**. Mỗi deploy = +1.1G `/tmp`
+ 1 tag `seo-worker:<sha>` (~5.2G, share layer). Box1 (109G) đầy 100% ngày 2026-09-22 →
`deploy_worker` fail `No space left on device (28)` ở rsync, 4 tag liền (v1.86.35–38), pipeline
vẫn xanh vì `allow_failure: true`. Box1 fail thì playbook dừng, box2 không được roll.

Dọn tay 2026-09-24: box1 100%→54%, box2 46%→28% (giữ `5a70157c`, `9e8444b1`, `prod-gen2-hydrate`,
staging4 `v15`). Fix gốc trong playbook chưa làm tại thời điểm ghi — check trước khi giả định.

**How to apply:** deploy_worker fail → xem `df -h /` trên box1/box2 trước. Box qua Tailscale SSH
(cần browser re-auth mỗi box). Liên quan [[seo-gen2-follower-fleet-deploy]], [[seo-master-no-detect-worker]].
