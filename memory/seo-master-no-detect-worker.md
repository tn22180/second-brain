---
name: seo-master-no-detect-worker
description: "seo master CI has NO detect_worker auto-deploy; prod worker redeploys ONLY on [deploy-worker] title"
metadata: 
  node_type: memory
  type: project
  originSessionId: a3f0f490-5c60-457e-82b7-5860fe12e2f5
---

seo repo **master** `.gitlab-ci.yml` `deploy_worker` job = `only.variables: $CI_COMMIT_TITLE =~ /\[deploy-worker\]/`. There is **no `detect_worker` job on master** (0 occurrences). So a normal merge to master does NOT redeploy the self-hosted worker box — GCF gets it (`deploy_production` unconditional) but the worker box does not.

The fail-safe `detect_worker` auto-detection (scripts/detect-worker-affected.js → DEPLOY_WORKER=true/false, any error → redeploy) that the worktree CLAUDE.md / worker-fleet docs describe lives ONLY on branch `feat/worker-pubsub-migration` — not yet merged to master. The worktree's CLAUDE.md describes the feature-branch state, not master.

To ship a fix to the prod worker box today: push a commit to master with `[deploy-worker]` in the title (an empty marker commit works — `git commit --allow-empty`). That renders `deploy_worker`, which rsyncs master source + `docker compose build/up` on `seo-worker-box` via the gcp-gw gateway (34.87.163.45, ProxyJump WireGuard). Verified 2026-07-21: pipeline 2693230610, deploy_worker success ~80s, all 3 containers up clean.

Master is protected (push/merge = Maintainer/40). glab token for querying pipelines lives in `speed-up-report/apps/functions/.env` as `GLAB_TOKEN`.

Related: [[verify-branch-before-diagnosing]] — same trap (docs/worktree describe a branch, not master).
