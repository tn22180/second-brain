---
name: speed-up-report-repo
description: speed-up-report repo location + gitlab remote; workspace has moved repeatedly causing data loss
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c530a18-e6a5-49ce-9a53-e3c0cec30190
---

`speed-up-report` (the daily-manager / Falcon reporting Next+Functions monorepo, NOT an Avada SEO repo) currently lives at `~/Documents/second-brain/projects/Falcon/speed-up-report`. Remote: `https://gitlab.com/avada/speed-team/speed-up-report.git`, active branch `feat/daily-manager`.

**Why:** the second-brain harness ([[daily-manager-page]] lineage) keeps physically relocating the Falcon workspace (`~/Documents/Falcon workspace/` → `~/Documents/second-brain/projects/Falcon/`). On 2026-07-15 a relocation gutted this repo on disk (only an empty `apps/web/.next` survived) and its local `.git` — including two unpushed commits — was lost. No Time Machine, no APFS user-data snapshot, iCloud not syncing `~/Documents`. Recovered by cloning the gitlab remote and reconstructing the 2 unpushed commits from the session transcript.

**How to apply:** always use the second-brain/projects/Falcon path, never the stale `~/Documents/Falcon workspace/` or `~/Documents/SEO-BLOG/speed-up-report` skeletons. PUSH work promptly — the local tree is not durable across harness moves. The repo is tracked under second-brain git via a gitignored `/projects/*` path, so it is NOT backed up by second-brain commits; its own gitlab remote is the only backup.
