---
name: resume-stuck-job
description: >-
  Use when a self-chaining Pub/Sub fan-out job in an Avada app has stalled and needs to be
  restarted — the job doc sits in a processing/running state but stopped advancing (one item
  stuck mid-flight, or the chain never dispatched the next item). Lets CS resume it safely
  without an engineer. Trigger phrases: "resume stuck job", "job stuck", "bulk fix stuck",
  "job not finishing", "resume <recipe> job <id>", "job kẹt", "chạy tiếp job", "job treo",
  "bulk AI fix không xong". Works from a recipe registry keyed by app; ships with SEO
  bulk-fix recipes and is extended per app on demand.
---

# Resume a stuck self-chaining fan-out job

Some Avada background jobs are **self-chaining fan-outs**: a job doc holds a queue of items;
processing one item publishes the Pub/Sub message for the next. If one item throws at the wrong
moment (and the subscriber swallows the error — the FAL-206 shape), the chain dies silently:
the job doc stays `processing` forever, items stay `pending`, nothing retries.

**Resume = repair the one broken link, not re-run the job.** Reset the stuck item back to its
restart status and publish exactly **one** message. The job's own dispatch-next logic takes it
from there. Never publish one message per pending item.

This is a **production write** to a live-merchant project. The confirmation gate below is
mandatory — no exceptions.

## When this applies

The job matches a **recipe** in [`recipes.json`](./recipes.json). If CS names a job type with no
recipe, this skill does not cover it yet — see [Add a recipe](#add-a-recipe). Do not improvise a
resume against an unknown collection/topic.

## Procedure (Claude follows this exactly)

CS says something like **"resume `seo-bulk-fix` job `BlbF3E0iKcvLZLGJ8RKR`"**, or gives only a
**shopID** and asks which jobs are stuck.

0. **(Optional) List a shop's jobs.** If CS gives a shopID instead of a job id, run the read-only
   list so they can spot the stalled one:
   ```bash
   python3 ~/.claude/skills/resume-stuck-job/resume.py jobs <recipe-id> <shopID>
   ```
   It prints every job for that shop in the recipe's collection with status, progress, age, and a
   **`MAYBE STUCK`** flag (active status + untouched > 15 min — a cheap heuristic, not a full
   scan). CS picks a job id from the flagged rows; then continue at step 1. The flag is only a
   hint — step 2 does the real diagnosis before any write.

1. **Pick the recipe.** It must be one of the ids in `recipes.json`
   (`python3 resume.py --list`). If CS didn't name one, ask which — do not guess.

2. **Diagnose (READ-ONLY).** Run:
   ```bash
   python3 ~/.claude/skills/resume-stuck-job/resume.py <recipe-id> <jobId>
   ```
   This makes no writes. It prints the target **production** project, the job status + age, the
   item tally, which item is the broken link, and the two exact writes it *would* perform.

3. **Handle the non-resumable verdicts.** If the diagnosis says any of these — **stop**, report
   to CS, do not force `--execute`:
   - *"Job already terminal"*, *"No items in queue"*, *"job doc NOT FOUND"* — nothing to do.
   - *"ACTIVELY PROCESSING, not stuck"* — the in-progress item is **fresh** (updated within the
     recipe's stale window, default 15 min). The job is healthy and still running; a kick would
     run the same item twice in parallel. Wait a few minutes and re-diagnose.
   - *"needs manual review"* (all items terminal but job not finalized) — goes to engineering.

4. **Choose reprocess vs skip.** The diagnosis prints both a default and, for a stuck in-progress
   item, an `--skip-item` alternative:
   - **default (reprocess)** — resets the item and republishes so it runs again. Use when the
     stall looks transient (a one-off timeout/OOM/kill; the item just never got retried).
   - **`--skip-item`** — marks the item errored, bumps the fail counter, and advances to the next
     item. Use when the item fails **deterministically** — it re-stalled at the *same* point after
     a reprocess, or the function logs show the same error/timeout repeating (e.g. an AI fix that
     keeps hitting the 60 s per-issue timeout across all attempts). Skipping loses that one item;
     the rest of the job completes.

5. **CONFIRM — mandatory gate.** Show CS the diagnosis and ask, in plain terms:
   > "This will write to PRODUCTION `<project>`: <reset item `<id>` and publish one restart
   > message> / <mark item `<id>` errored and advance to the next>. Confirm? (yes/no)"
   Wait for an explicit **yes**. Anything else → stop. Do not run `--execute` on assumption,
   silence, or a background-task notification.

6. **Execute.** Only after "yes":
   ```bash
   # reprocess the stuck item
   python3 ~/.claude/skills/resume-stuck-job/resume.py <recipe-id> <jobId> --execute
   # OR skip it and advance
   python3 ~/.claude/skills/resume-stuck-job/resume.py <recipe-id> <jobId> --execute --skip-item
   ```

7. **Verify.** Wait ~1–2 min, then re-run the read-only diagnosis (step 2) or read the job doc.
   Confirm the counters moved (completed went up, the item advanced, a new item is now
   in-progress). Report the before/after to CS. If it stalled again at a *different* item, repeat
   from step 2. If it stalled again at the *same* item after a reprocess, switch to `--skip-item`.

## Recipes shipped

| Recipe id            | App | Project    | What it resumes                                   | Writes Shopify? |
| -------------------- | --- | ---------- | ------------------------------------------------- | --------------- |
| `seo-bulk-fix`       | SEO | avada-seo  | Bulk AI Fix — the fix/score chain                 | no              |
| `seo-bulk-fix-apply` | SEO | avada-seo  | Bulk AI Fix — the APPLY chain (pushes to Shopify) | **yes**         |

Other Avada apps (Blog, APC, AEO, image-optimizer) have the same class of jobs but **no recipe
yet** — add one when a ticket needs it.

## Add a recipe

Adding an app/job means one-time, *verified* homework — a wrong topic or project id here writes
to the wrong prod store. For the target job family, confirm from its code:

- **project** — the PROD Firebase project id (see `~/.claude/CLAUDE.md` repo→project table).
- **collection** + **itemsSubcollection** — where the job doc and its per-item docs live.
- **itemQueueSource** — `"subcollection"` (all item docs) or `"jobField:<name>"` (item ids come
  from an array field on the job doc, e.g. apply's `applyProductIds`).
- **jobStatusField** / **jobActiveStatuses** / **jobTerminalStatuses** — the job-level status
  field and its values. (Apply uses `applyStatus`, not `status`.)
- **itemStatusField** and its **InProgress** / **Pending** / **Terminal** / **Restart** values —
  from the item status enum. InProgress = mid-flight statuses (the ones a killed item is stuck
  in); Pending = waiting; Restart = the status the dispatcher expects a fresh item to be in
  (usually `queued`).
- **topic** + **payloadTemplate** — the Pub/Sub topic that processes ONE item, and the exact
  message shape it parses. Use `$JOB`, `$ITEM`, `$SHOP` placeholders.
- **shopFieldOnJob** — where to read shopID on the job doc for the payload.
- **itemErrorField** — the item's error field to clear on reset (optional).
- **mutatesShopify** — true if resuming re-writes the merchant's store (extra warning).

Verify the "dispatch next" function and whether the subscriber swallows or rethrows before
trusting a recipe. Then add the entry to `recipes.json` and this table.

## Notes

- Auth is the operator's `gcloud` (`gcloud auth print-access-token` + `gcloud pubsub publish`).
  If CS lacks access, they can't run it — that's the intended guard.
- The engine caps subcollection reads at one 300-item page; every current recipe is ≤ 50 items.
- This does **not** fix the root cause (subscribers swallowing errors, FAL-206). It gets a stuck
  job moving again. The permanent fix — rethrow so Pub/Sub redelivers — is an engineering change.
