# bench — offline model bench for BLOG/APC (throwaway)

Compares candidate text and image models — OpenRouter **and Ollama Cloud**
— on real Avada workloads (APC product descriptions, BLOG audit-agent
fixes/gen-ai-suggested/alt-text, BLOG featured images), scores text with a
3-judge panel (always run through OpenRouter, regardless of which provider
generated the candidate output), and prints a model x quality x latency x
cost table. Python 3 stdlib only — no pip installs.

This is a one-off decision tool, not shipped code. It does not touch
`projects/Falcon/**`.

## Provider selection

A model id is routed by an `ollama:` prefix: anything starting with
`ollama:` goes to Ollama Cloud (`https://ollama.com/api/chat`, the prefix is
stripped before the call); everything else goes to OpenRouter, unchanged
from before. Mix both in one `--models` list, e.g.:

```
--models "google/gemini-2.5-flash-lite,ollama:gemma4:31b,ollama:glm-5.3-flash"
```

Judges (`--judges`) must always be plain OpenRouter ids — the harness
refuses to start if a judge carries the `ollama:` prefix, because the whole
point of the panel is scoring both providers' outputs on the same scale
through the same judge models.

## SPEND WARNING — shared production wallet (OpenRouter) and shared quota (Ollama Cloud)

The OpenRouter key this reads (`projects/Falcon/blogs/packages/functions/.env`)
is the **same key that serves live AI traffic for BLOG and APC in
production**. Account balance was $31.57 as of 2026-08-27. Draining it
breaks production AI for real merchants.

The Ollama Cloud key this reads (`projects/Falcon/seo/packages/functions/.env`,
override with `--ollama-env-file`) is the **same key SEO's worker fleet uses
in production** — roughly 6,847 calls/day, against a weekly per-account
ceiling of roughly 76,100 requests. Ollama Cloud calls return **no
`usage.cost`** — they're billed against that subscription quota, not
dollars, so `--max-spend` cannot see or protect it.

Guardrails built in:
- `--max-spend USD` hard-caps the run's OpenRouter dollar spend, **default
  $0.50**. After every real OpenRouter response, the script adds the actual
  `usage.cost` OpenRouter returns (never an estimate from a price table) to
  a running total, prints it, and aborts the whole run the instant the
  total would exceed the cap.
- `--max-ollama-calls N` hard-caps the run's **Ollama Cloud call count**,
  **default 40**, enforced completely independently of the dollar guard
  (`OllamaCallGuard`, mirrors `SpendGuard`'s abort-on-exceed behavior). This
  exists because dollars can't bound this provider — the call count is the
  only thing that can.
- `--dry-run` prints the planned call matrix (both providers, both guards)
  and a rough cost estimate and makes **zero** network calls. Always
  dry-run first when changing cases/models/judges.
- Neither key is ever printed or put on a command line.
  `--show-key-fingerprint` prints only `sha256(key)[:8]` + length for each.

Always start a new case/model set with `--dry-run`, check both the OpenRouter
call count and the Ollama call count, then run for real with a tight
`--max-spend` and a deliberate `--max-ollama-calls`.

## Layout

```
run.py                       the harness (single file, stdlib only)
cases/text_cases.json        5 APC-shaped product-description cases (kind="html")
cases/blog_text_cases.json   6 BLOG-shaped cases (kind="json") -- audit-agent fixes,
                              gen-ai-suggested (topic/keyword/outline), alt-text
cases/image_cases.json       3 BLOG featured-image prompts (16:9 target)
out/                          JSON result files per run (raw records + aggregate)
images/                       generated images (PNG/JPEG/WebP) from the image subcommand
```

## Usage

Preview both benchmarks, zero calls:

```
python3 "run.py" --dry-run
```

Text benchmark (product descriptions, judged):

```
python3 "run.py" --max-spend 0.30 text \
  --limit-cases 2 \
  --models "google/gemini-2.5-flash-lite,openai/gpt-4.1-mini" \
  --judges "google/gemini-2.5-flash,openai/gpt-4.1-mini,anthropic/claude-haiku-4.5"
```

BLOG-shaped text benchmark (audit-agent fixes / gen-ai-suggested / alt-text,
judged), OpenRouter incumbents vs Ollama Cloud candidates:

```
python3 "run.py" --max-spend 1.50 --max-ollama-calls 40 text \
  --cases-file cases/blog_text_cases.json \
  --models "google/gemini-2.5-flash-lite,google/gemini-2.5-flash,ollama:gemma4:31b,ollama:glm-5.3-flash,ollama:qwen3.5:397b,ollama:deepseek-v4-flash:0731" \
  --judges "google/gemini-2.5-flash,openai/gpt-4.1-mini,anthropic/claude-haiku-4.5"
```

Image benchmark (featured images, aspect-ratio compliance, no LLM judge):

```
python3 "run.py" --max-spend 0.15 image --limit-cases 1 \
  --models "google/gemini-2.5-flash-image"
```

Global flags go **before** the subcommand (`text`/`image`); subcommand flags
go after.

## Flags

Global:
- `--env-file` — path to a `.env` with `OPENROUTER_API_KEY`. Defaults to the
  BLOG functions `.env` (`projects/Falcon/blogs/packages/functions/.env`).
- `--ollama-env-file` — path to a `.env` with `OLLAMA_API_KEY` (or
  `OLLAMA_API_KEYS`, comma-separated — first entry is used). Defaults to the
  SEO functions `.env` (`projects/Falcon/seo/packages/functions/.env`). Only
  read/required when at least one `ollama:`-prefixed model is in play.
- `--max-spend` — USD hard cap for this run's accumulated OpenRouter
  `usage.cost`. Default `0.50`. Does not bound Ollama Cloud.
- `--max-ollama-calls` — hard cap on Ollama Cloud call count for this run,
  independent of dollars. Default `40`.
- `--dry-run` — print the matrix + call count + rough estimate, make no
  calls.
- `--out-dir` — where JSON result files land. Default `./out`.
- `--show-key-fingerprint` — print `sha256(key)[:8]` + length for both keys,
  for debugging key loading without ever printing either key.

`text` subcommand:
- `--cases-file` — default `cases/text_cases.json`. Use
  `cases/blog_text_cases.json` for the BLOG-shaped (JSON-output) cases.
- `--models` — comma-separated models under test. Prefix with `ollama:` to
  route to Ollama Cloud (see Provider selection above).
- `--judges` — comma-separated judge models (OpenRouter only; a judge is
  skipped for a case where it equals the model under test, to avoid
  self-judging).
- `--limit-cases` — truncate the case list (for cheap smoke tests).
- `--max-tokens`, `--temperature` — passed to the OpenRouter chat completion
  call (Ollama Cloud calls in this harness don't take these — the endpoint
  has no equivalent knob exposed here).

`image` subcommand:
- `--cases-file` — default `cases/image_cases.json`.
- `--models` — comma-separated image models under test.
- `--limit-cases` — truncate the case list.
- `--images-dir` — where generated PNGs are saved. Default `./images`.

## What gets measured

**Text**: per (case, model) — latency (measured identically for both
providers via the same `http_post_json` timer), `usage.cost` (always `0.0`
for Ollama Cloud — see spend warning above), completion/reasoning token
counts where the provider reports them, the raw output, and two
format-compliance checks whose meaning depends on the case's `kind`:

- `kind: "html"` (`cases/text_cases.json`, APC product copy): word-count-in-range,
  allowed-HTML-tags-only.
- `kind: "json"` (`cases/blog_text_cases.json`, BLOG audit-agent/gen-ai-suggested/alt-text):
  strict-JSON-parses (`json_valid`), and a holistic per-case contract check
  (`required_keys` present; an optionally-nested, dotted-path array's item
  count/range and per-item required field; a top-level or per-array-item
  sentence/word cap; a required-keyword-present check; a soft/informational
  char-length check) — see `json_format_compliance()` in `run.py`.

Each successful output is then scored by 3 judge models (excluding the model
under test, and always via OpenRouter regardless of which provider generated
the candidate) on the same 5-axis 1-5 rubric for both kinds — `constraints`,
`html_validity`, `keyword_integration`, `no_leakage`, `copy_quality` — but
the **judge system prompt is chosen by case kind** (`JUDGE_SYSTEM` for html,
`JUDGE_SYSTEM_JSON` for json): for json-kind cases the same 5 JSON keys are
redefined in the prompt as JSON-output validity, task fidelity (did the
model actually make the requested edit correctly, not just plausibly),
leakage, and copy quality — the aggregate/table code only ever consumes the
mean of the 5 values, never the per-axis labels, so this reuses the existing
panel/aggregation machinery unchanged. Judges must return strict JSON; a
judge whose output fails to parse is recorded as a failure, not silently
dropped. Per-model score = mean of judge overalls across cases; **judge
spread** = mean(max judge score − min judge score) per case. Spread ≥ 1.5
(on the 1-5 scale) is flagged `*UNRELIABLE*` in the table and the script
prints a warning that the ranking should not be acted on as-is.

**Image**: per (case, model) — latency, `usage.cost`, decoded width x height,
computed aspect ratio, and a boolean `aspect_16x9_compliant` (within 5% of
16:9). Dimensions are parsed directly from the image's own header bytes —
no Pillow — dispatched by magic-byte sniffing (`image_dimensions()` in
`run.py`) across the 3 formats OpenRouter's image models are known to
return: PNG `IHDR` (`gemini-2.5-flash-image`), JPEG SOF marker
(`gemini-3.1-flash-lite-image`), and WebP `VP8X`/`VP8L`/lossy-`VP8 `
(`meta/muse-image`) — the saved file's extension now matches the real
`media_type` too (`.jpg`/`.webp`/`.png`), not a blanket `.png`. No LLM judge
for images — the table plus saved file paths are for a human to eyeball.
This is deliberate: the known failure mode (a model silently returning
square instead of 16:9 for a blog featured image) is exactly what the
aspect-ratio column exists to catch.

Every run writes both a stdout table and a JSON file under `out/` with the
full raw records, so a later run can be diffed against this one.

## Failure handling

Every call is wrapped: `HTTPError` is caught, the status code and response
body (verbatim, up to 800 chars) are recorded, and the run continues with
the next model/case. A model that 404s because it's the wrong endpoint shows
up in the results table with that message rather than crashing the run or
being silently retried. This applies the same way to Ollama Cloud calls
(different response shape, same try/except-and-record pattern).

## Known result from the reference run (2026-08-27)

`google/gemini-2.5-flash-image` returned **1024x1024 (aspect 1.0)** for a
prompt explicitly asking for 16:9 — confirms the exact defect this harness
exists to catch before a model swap ships to BLOG's featured-image path.

Before the fix, `image_dimensions()`'s predecessor (`png_dimensions()`,
PNG-only) reported `NonexNone` for `gemini-3.1-flash-lite-image` (JPEG) and
`meta/muse-image` (WebP) — both now parse correctly, verified against the
2026-08-27 run's saved output files (JPEG: 1376x768; WebP/VP8X: 2048x1152).
