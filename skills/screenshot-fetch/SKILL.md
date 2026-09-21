---
name: screenshot-fetch
description: Download the customer screenshots referenced in a bug report (capture.avada.io links + direct image URLs) to local files so a vision-capable model can Read and literally SEE them. Use whenever a Slack thread or Crisp transcript contains capture.avada.io/i/<id> or bare image links — screenshots often carry the decisive detail the text omits.
---

# screenshot-fetch — make screenshots visible to the model

```bash
echo "<any text containing links>" | node tools/fetch-captures.js <dest-dir>
# prints one LOCAL file path per downloaded screenshot; best-effort, never exits non-zero
```

- `https://capture.avada.io/i/<id>` pages are HTML viewers — the tool resolves the real image
  via the page's `og:image` (public CloudFront CDN) and downloads that.
- Bare `…png/.jpg/.webp/.gif` URLs download as-is. Deduped.
- Then **Read the local files** — vision works on local paths only (Read cannot fetch a URL,
  WebFetch returns text not pixels). That's WHY this is a deterministic pre-step, not a
  "model may fetch if it wants" instruction.

## Gotchas

- **Slack's own uploaded images are NOT covered** (`files.slack.com` needs authed download —
  not built). Only capture.avada.io + public direct links.
- Bad/dead links are skipped silently — check how many paths were printed vs how many links
  existed before concluding "no screenshots".
- In the bot: `diagnose.js` pipes thread+issue text through this into
  `/state/screenshots/<bug_id>/` and lists the paths in the evidence, telling the model to
  Read each. Downloads live OUTSIDE worktrees (keeps `git diff` clean).
- Feed it BOTH the Slack thread text and the Crisp transcript — reply-attached and
  Crisp-shared screenshots are frequently the ones that matter.

> In the bot container the repo root is `/app` — prefix tool paths accordingly (e.g. `node /app/tools/…`); `SECRETS_DIR` is already `/secrets` there.
