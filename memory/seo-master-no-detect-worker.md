---
name: seo-master-no-detect-worker
description: "LỖI THỜI về trigger (deploy giờ theo tag — xem seo-prod-deploy-by-tag); phần detect_worker + token vẫn đúng"
metadata: 
  node_type: memory
  type: project
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
  modified: 2026-07-31T09:23:22.371Z
---

> **Lỗi thời từ 2026-08-20 ở phần trigger.** `deploy_worker` giờ là `only: - tags`; merge master
> không deploy gì. Xem [[seo-prod-deploy-by-tag]]. Phần `detect_worker` chỉ có trên
> `feat/worker-pubsub-migration` và phần token GitLab bên dưới vẫn đúng.

seo repo **master** `.gitlab-ci.yml` `deploy_worker` job (tới 2026-07-31) = `only.variables: $CI_COMMIT_TITLE =~ /\[deploy-worker\]/`. There is **no `detect_worker` job on master** (0 occurrences). So a normal merge to master does NOT redeploy the self-hosted worker box — GCF gets it (`deploy_production` unconditional) but the worker box does not.

The fail-safe `detect_worker` auto-detection (scripts/detect-worker-affected.js → DEPLOY_WORKER=true/false, any error → redeploy) that the worktree CLAUDE.md / worker-fleet docs describe lives ONLY on branch `feat/worker-pubsub-migration` — not yet merged to master. The worktree's CLAUDE.md describes the feature-branch state, not master.

To ship a fix to the prod worker box today: push a commit to master with `[deploy-worker]` in the title (an empty marker commit works — `git commit --allow-empty`). That renders `deploy_worker`, which rsyncs master source + `docker compose build/up` on `seo-worker-box` via the gcp-gw gateway (34.87.163.45, ProxyJump WireGuard). Verified 2026-07-21: pipeline 2693230610, deploy_worker success ~80s, all 3 containers up clean.

Master is protected (push/merge = Maintainer/40). A glab token for querying pipelines lives in `speed-up-report/apps/functions/.env` as `GLAB_TOKEN`, but as of 2026-07-31 it is **revoked** — `Token was revoked. You have to re-authorize from the user.` Nothing else on the machine holds a GitLab API credential: `glab auth status` is 401, no `~/.config/glab-cli/`, no `GITLAB_TOKEN` in env, and `ssh -T git@gitlab.com` is `Permission denied (publickey)`. `git push` over HTTPS still works from the osxkeychain credential, so pushing a branch succeeds while anything API-driven (opening an MR, reading pipelines) fails. Fix by running `glab auth login`.

Related: [[verify-branch-before-diagnosing]] — same trap (docs/worktree describe a branch, not master).
