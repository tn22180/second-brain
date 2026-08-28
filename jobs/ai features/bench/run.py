#!/usr/bin/env python3
"""
Throwaway offline benchmark harness: compares LLM/image models on real Avada
workloads (APC product descriptions, blog featured images) and scores text
output with a 3-judge panel. Stdlib only.

SAFETY: the OpenRouter key used here is shared with PRODUCTION traffic for
two live Shopify apps (BLOG, APC). This script hard-caps spend via
--max-spend (default $0.50), checked against the real `usage.cost` OpenRouter
returns after every call -- never estimated. See README.md.

Usage:
  python3 run.py --dry-run
  python3 run.py text --max-spend 0.30 --limit-cases 2 --models google/gemini-2.5-flash-lite,openai/gpt-4.1-mini
  python3 run.py image --max-spend 0.20 --limit-cases 1
"""

import argparse
import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BENCH_DIR = Path(__file__).resolve().parent
DEFAULT_ENV_FILE = "/Users/nguyentuan/Documents/second-brain/projects/Falcon/blogs/packages/functions/.env"
DEFAULT_OLLAMA_ENV_FILE = "/Users/nguyentuan/Documents/second-brain/projects/Falcon/seo/packages/functions/.env"
DEFAULT_TEXT_CASES = BENCH_DIR / "cases" / "text_cases.json"
DEFAULT_IMAGE_CASES = BENCH_DIR / "cases" / "image_cases.json"
DEFAULT_OUT_DIR = BENCH_DIR / "out"
DEFAULT_IMAGES_DIR = BENCH_DIR / "images"

CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
IMAGES_URL = "https://openrouter.ai/api/v1/images"
OLLAMA_CHAT_URL = "https://ollama.com/api/chat"
OLLAMA_TAGS_URL = "https://ollama.com/api/tags"
OLLAMA_PREFIX = "ollama:"

TEXT_MODELS_DEFAULT = [
    "google/gemini-2.5-flash-lite",
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-flash",
]
JUDGES_DEFAULT = [
    "google/gemini-2.5-flash",
    "openai/gpt-4.1-mini",
    "anthropic/claude-haiku-4.5",
]
IMAGE_MODELS_DEFAULT = [
    "meta/muse-image",
    "google/gemini-3.1-flash-lite-image",
    "google/gemini-2.5-flash-image",
]

# Rough, non-authoritative per-call guesses used ONLY for --dry-run's printed
# estimate. The live spend guard never uses these -- it sums real usage.cost.
ROUGH_TEXT_CALL_COST = 0.0015
ROUGH_JUDGE_CALL_COST = 0.0008
ROUGH_IMAGE_CALL_COST = 0.02

# Ollama Cloud bills against a shared subscription quota, not usage.cost --
# --max-spend cannot see or protect that quota. DEFAULT_MAX_OLLAMA_CALLS is
# the separate, independently-enforced guard for it. See OllamaCallGuard.
DEFAULT_MAX_OLLAMA_CALLS = 40

JUDGE_AXES = [
    "constraints",
    "html_validity",
    "keyword_integration",
    "no_leakage",
    "copy_quality",
]

JUDGE_SYSTEM = """You are a strict QA judge for e-commerce product copy. \
Score the OUTPUT below on 5 axes, each 1 (very poor) to 5 (excellent):
- constraints: follows the prompt's explicit constraints (word length range, allowed HTML tags only, language = English)
- html_validity: valid, well-formed HTML using ONLY the allowed tags listed
- keyword_integration: the required keyword is integrated naturally, not stuffed or awkward
- no_leakage: no template/instruction/system-prompt leakage into the visible output (no "Sure, here is...", no restating the brief, no meta commentary)
- copy_quality: persuasive, readable copy quality suitable for an e-commerce audience

Return ONLY strict JSON, no markdown fences, no commentary, matching exactly:
{"constraints": <1-5 int>, "html_validity": <1-5 int>, "keyword_integration": <1-5 int>, "no_leakage": <1-5 int>, "copy_quality": <1-5 int>, "notes": "<one short sentence>"}
"""

# BLOG's real AI calls (audit-agent fixes, gen-ai-suggested, alt-text) return
# strict JSON, not HTML copy -- so "html_validity"/"keyword_integration" as
# literally named don't apply. Same 5-axis 1-5 JSON *shape* (aggregate_text
# and print_text_table only ever consume the mean of the 5 values, never the
# per-axis labels, so reusing the key names is safe), redefined here for a
# structured-output task judged against a case-supplied constraints brief:
JUDGE_SYSTEM_JSON = """You are a strict QA judge for an AI content-editing pipeline (Shopify blog SEO). \
The model was given a system+user prompt with explicit output-format rules; you are shown the constraints \
brief and its OUTPUT. Score the OUTPUT on 5 axes, each 1 (very poor) to 5 (excellent):
- constraints: the OUTPUT satisfies every explicit constraint in the brief below (schema shape, array/item counts, length or word caps, language preservation, "JSON only" etc.)
- html_validity: (read as "output_validity") the OUTPUT is valid, directly-parseable JSON, contains ONLY the required top-level keys, no markdown fences, no prose before/after the JSON
- keyword_integration: (read as "task_fidelity") the requested edit or suggestion is actually correct and usable as-is (e.g. a keyword genuinely inserted where asked, a sentence genuinely shortened below its cap, an outline that genuinely reflects the given topic/keywords) -- not just superficially plausible
- no_leakage: no template/instruction/system-prompt leakage into the JSON values (no "Sure, here is...", no restating the brief, no meta commentary inside string values)
- copy_quality: the edited/generated text itself reads naturally and fits the brand-neutral SEO-editor voice implied by the brief

Return ONLY strict JSON, no markdown fences, no commentary, matching exactly:
{"constraints": <1-5 int>, "html_validity": <1-5 int>, "keyword_integration": <1-5 int>, "no_leakage": <1-5 int>, "copy_quality": <1-5 int>, "notes": "<one short sentence>"}
"""


class SpendCapExceeded(Exception):
    pass


class OllamaCapExceeded(Exception):
    pass


class SpendGuard:
    def __init__(self, max_spend):
        self.max_spend = max_spend
        self.total = 0.0
        self.calls = 0

    def add(self, cost, label=""):
        cost = cost or 0.0
        self.total += cost
        self.calls += 1
        print(f"  [spend] +${cost:.6f} ({label}) running_total=${self.total:.6f} / cap=${self.max_spend:.2f}")
        if self.total > self.max_spend:
            print(f"\n!!! SPEND CAP EXCEEDED: ${self.total:.6f} > ${self.max_spend:.2f} -- aborting run now.")
            raise SpendCapExceeded(self.total)


class OllamaCallGuard:
    """Ollama Cloud calls return no usage.cost -- billed against a shared
    subscription quota (SEO prod alone burns ~6,847 calls/day against it;
    weekly per-account ceiling is ~76,100). --max-spend cannot see that
    quota, so this counts and caps Ollama calls independently of dollars."""

    def __init__(self, max_calls):
        self.max_calls = max_calls
        self.calls = 0

    def add(self, label=""):
        self.calls += 1
        print(f"  [ollama] call #{self.calls} ({label}) cap={self.max_calls}")
        if self.calls > self.max_calls:
            print(f"\n!!! OLLAMA CALL CAP EXCEEDED: {self.calls} > {self.max_calls} -- aborting run now.")
            raise OllamaCapExceeded(self.calls)


def parse_model_id(model_id):
    """'ollama:<name>' -> ('ollama', '<name>'); anything else -> ('openrouter', model_id)."""
    if model_id.startswith(OLLAMA_PREFIX):
        return "ollama", model_id[len(OLLAMA_PREFIX):]
    return "openrouter", model_id


def load_env(env_file):
    path = Path(env_file)
    if not path.exists():
        print(f"ERROR: env file not found: {path}", file=sys.stderr)
        sys.exit(1)
    values = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        values[key] = val
    return values


def key_fingerprint(key):
    if not key:
        return "(none)", 0
    return hashlib.sha256(key.encode()).hexdigest()[:8], len(key)


def http_post_json(url, api_key, payload, timeout=120):
    """Returns (json_or_none, latency_seconds, error_dict_or_none)."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
        latency = time.time() - start
        return json.loads(body), latency, None
    except urllib.error.HTTPError as e:
        latency = time.time() - start
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = "<unreadable body>"
        return None, latency, {"status": e.code, "message": body[:800]}
    except urllib.error.URLError as e:
        latency = time.time() - start
        return None, latency, {"status": None, "message": f"URLError: {e.reason}"}
    except (json.JSONDecodeError, TimeoutError) as e:
        latency = time.time() - start
        return None, latency, {"status": None, "message": f"{type(e).__name__}: {e}"}


def strip_json_fences(text):
    t = text.strip()
    if t.startswith("```"):
        lines = t.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


# ---------------------------------------------------------------------------
# Text benchmark
# ---------------------------------------------------------------------------

def call_chat(api_key, model, system, user, max_tokens, temperature):
    """OpenRouter chat completion. `model` is the bare OpenRouter model id
    (no provider prefix) -- caller resolves the prefix via parse_model_id."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    resp, latency, err = http_post_json(CHAT_URL, api_key, payload)
    record = {"model": model, "provider": "openrouter", "latency_s": round(latency, 3)}
    if err is not None:
        record.update({"ok": False, "error": err, "cost": 0.0})
        return record
    try:
        content = resp["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        record.update({"ok": False, "error": {"status": None, "message": f"unexpected shape: {json.dumps(resp)[:500]}"}, "cost": 0.0})
        return record
    usage = resp.get("usage", {}) or {}
    cost = usage.get("cost", 0.0) or 0.0
    completion_tokens = usage.get("completion_tokens")
    reasoning_tokens = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
    record.update({
        "ok": True,
        "output": content,
        "cost": cost,
        "completion_tokens": completion_tokens,
        "reasoning_tokens": reasoning_tokens,
        "raw_usage": usage,
    })
    return record


def call_chat_ollama(api_key, model, system, user, timeout=180):
    """Ollama Cloud chat completion: POST /api/chat, non-streaming.
    Different wire shape than OpenRouter -- reply text is at message.content,
    and there is no usage.cost (billed against subscription quota, not
    dollars; see OllamaCallGuard). Latency is measured the same way as
    OpenRouter via http_post_json so the two providers are comparable."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
    }
    resp, latency, err = http_post_json(OLLAMA_CHAT_URL, api_key, payload, timeout=timeout)
    record = {"model": model, "provider": "ollama", "latency_s": round(latency, 3)}
    if err is not None:
        record.update({"ok": False, "error": err, "cost": 0.0})
        return record
    try:
        content = resp["message"]["content"]
    except (KeyError, TypeError):
        record.update({"ok": False, "error": {"status": None, "message": f"unexpected shape: {json.dumps(resp)[:500]}"}, "cost": 0.0})
        return record
    record.update({
        "ok": True,
        "output": content,
        "cost": 0.0,  # Ollama Cloud: subscription quota, not usage.cost
        "completion_tokens": resp.get("eval_count"),
        "reasoning_tokens": None,
        "raw_usage": {"eval_count": resp.get("eval_count"), "prompt_eval_count": resp.get("prompt_eval_count")},
    })
    return record


def generate_text(openrouter_key, ollama_key, model_id, system, user, max_tokens, temperature):
    """Dispatch a generation call to the right provider based on model_id's
    'ollama:' prefix (see parse_model_id). Always tags the result with the
    ORIGINAL prefixed model_id so results/tables group by it unambiguously."""
    provider, real_model = parse_model_id(model_id)
    if provider == "ollama":
        gen = call_chat_ollama(ollama_key, real_model, system, user)
    else:
        gen = call_chat(openrouter_key, real_model, system, user, max_tokens, temperature)
    gen["model"] = model_id
    return gen


def word_count(html_text):
    import re
    text = re.sub(r"<[^>]+>", " ", html_text)
    words = [w for w in text.split() if w.strip()]
    return len(words)


def used_tags(html_text):
    import re
    return sorted(set(t.lower() for t in re.findall(r"</?([a-zA-Z0-9]+)[^>]*>", html_text)))


def _get_path(d, dotted_path):
    cur = d
    for part in dotted_path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _sentence_word_violations(text, max_words):
    import re
    plain = re.sub(r"<[^>]+>", " ", text or "")
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", plain.strip()) if s]
    return [s for s in sentences if len(s.split()) > max_words]


def json_format_compliance(case, output_text):
    """Automated format-compliance check for BLOG-shaped (kind="json") cases:
    valid JSON, has the required top-level key(s), an (optionally nested,
    dotted-path) array's item count and per-item fields, a top-level
    sentence/word cap, and a keyword-presence check. Mirrors what
    word_count/used_tags check for HTML cases, generalized for the strict
    JSON contract BLOG's real prompts (audit-agent fixes, gen-ai-suggested,
    alt-text) impose. `keys_ok` is a holistic "matches the task's real
    contract" flag, not just "has the right top-level keys"."""
    detail = []
    try:
        parsed = json.loads(strip_json_fences(output_text))
    except (json.JSONDecodeError, TypeError):
        return {"json_valid": False, "keys_ok": False, "detail": "invalid JSON"}

    if not isinstance(parsed, dict):
        return {"json_valid": True, "keys_ok": False, "detail": "top level is not a JSON object"}

    required = case.get("required_keys", [])
    missing = [k for k in required if k not in parsed]
    keys_ok = not missing
    if missing:
        detail.append(f"missing required key(s): {missing}")

    array_key = case.get("array_key")  # may be a dotted path, e.g. "outline.body"
    if array_key:
        arr = _get_path(parsed, array_key)
        if not isinstance(arr, list):
            keys_ok = False
            detail.append(f"'{array_key}' is not a list")
        else:
            expected = case.get("array_count")
            lo, hi = case.get("array_count_min"), case.get("array_count_max")
            if expected is not None and len(arr) != expected:
                keys_ok = False
                detail.append(f"'{array_key}' has {len(arr)} items, expected {expected}")
            elif lo is not None and hi is not None and not (lo <= len(arr) <= hi):
                keys_ok = False
                detail.append(f"'{array_key}' has {len(arr)} items, expected {lo}-{hi}")

            item_field = case.get("array_item_field")
            if item_field and isinstance(arr, list):
                empty = [i for i, item in enumerate(arr) if not (isinstance(item, dict) and str(item.get(item_field, "")).strip())]
                if empty:
                    keys_ok = False
                    detail.append(f"{len(empty)} '{array_key}' item(s) missing/empty '{item_field}'")
                item_max_words = case.get("array_item_max_words_per_sentence")
                if item_max_words:
                    total_over = 0
                    for item in arr:
                        if isinstance(item, dict):
                            total_over += len(_sentence_word_violations(str(item.get(item_field, "")), item_max_words))
                    if total_over:
                        keys_ok = False
                        detail.append(f"{total_over} sentence(s) across '{array_key}' exceed {item_max_words}-word cap")

    sentence_field = case.get("sentence_field")
    max_words = case.get("max_words_per_sentence")
    if sentence_field and max_words:
        text_val = parsed.get(sentence_field) if isinstance(parsed.get(sentence_field), str) else ""
        over = _sentence_word_violations(text_val, max_words)
        if over:
            keys_ok = False
            detail.append(f"{len(over)} sentence(s) exceed {max_words}-word cap")

    keyword_field = case.get("keyword_field")
    keyword = case.get("keyword")
    if keyword_field and keyword:
        text_val = parsed.get(keyword_field) if isinstance(parsed.get(keyword_field), str) else ""
        if keyword.lower() not in text_val.lower():
            keys_ok = False
            detail.append(f"required keyword \"{keyword}\" not found in '{keyword_field}'")

    # Soft/informational only -- does not gate keys_ok (source prompt says "if possible").
    soft_max_chars_field = case.get("soft_max_chars_field")
    soft_max_chars = case.get("soft_max_chars")
    if soft_max_chars_field and soft_max_chars:
        text_val = parsed.get(soft_max_chars_field) if isinstance(parsed.get(soft_max_chars_field), str) else ""
        if len(text_val) > soft_max_chars:
            detail.append(f"(soft) '{soft_max_chars_field}' is {len(text_val)} chars, target <= {soft_max_chars}")

    return {"json_valid": True, "keys_ok": keys_ok, "detail": "; ".join(detail) if detail else "ok"}


def call_judge(api_key, judge_model, case, candidate_output):
    kind = case.get("kind", "html")
    if kind == "json":
        judge_system = JUDGE_SYSTEM_JSON
        user = (
            f"Constraints brief:\n{case.get('judge_constraints', '(none given)')}\n\n"
            f"OUTPUT:\n{candidate_output}"
        )
    else:
        judge_system = JUDGE_SYSTEM
        user = (
            f"Constraints:\n"
            f"- word length range: {case['min_words']}-{case['max_words']} words\n"
            f"- allowed HTML tags only: {', '.join(case['allowed_tags'])}\n"
            f"- language: English\n"
            f"- required keyword: \"{case['keyword']}\"\n\n"
            f"OUTPUT:\n{candidate_output}"
        )
    payload = {
        "model": judge_model,
        "messages": [
            {"role": "system", "content": judge_system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 300,
        "temperature": 0.0,
    }
    resp, latency, err = http_post_json(CHAT_URL, api_key, payload)
    record = {"judge": judge_model, "latency_s": round(latency, 3)}
    if err is not None:
        record.update({"ok": False, "error": err, "cost": 0.0})
        return record
    try:
        content = resp["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        record.update({"ok": False, "error": {"status": None, "message": f"unexpected shape: {json.dumps(resp)[:500]}"}, "cost": 0.0})
        return record
    usage = resp.get("usage", {}) or {}
    cost = usage.get("cost", 0.0) or 0.0
    record["cost"] = cost
    try:
        parsed = json.loads(strip_json_fences(content))
        scores = {axis: parsed.get(axis) for axis in JUDGE_AXES}
        if any(not isinstance(scores[a], (int, float)) for a in JUDGE_AXES):
            raise ValueError("missing/non-numeric axis score")
        record.update({"ok": True, "scores": scores, "notes": parsed.get("notes", ""), "raw": content})
    except (json.JSONDecodeError, ValueError) as e:
        record.update({"ok": False, "error": {"status": None, "message": f"judge JSON parse failed: {e}; raw={content[:300]}"}})
    return record


def run_text_bench(openrouter_key, ollama_key, cases, models, judges, max_spend, max_ollama_calls,
                    max_tokens, temperature, out_dir, dry_run):
    n_gen_calls = len(cases) * len(models)
    ollama_models = [m for m in models if parse_model_id(m)[0] == "ollama"]
    n_ollama_gen_calls = len(cases) * len(ollama_models)
    total_judge_calls = 0
    for m in models:
        eff_judges = [j for j in judges if j != m]
        total_judge_calls += len(cases) * len(eff_judges)
    total_calls = n_gen_calls + total_judge_calls
    est_cost = (n_gen_calls - n_ollama_gen_calls) * ROUGH_TEXT_CALL_COST + total_judge_calls * ROUGH_JUDGE_CALL_COST
    case_kinds = sorted(set(c.get("kind", "html") for c in cases))

    print("=== TEXT BENCHMARK: planned matrix ===")
    print(f"cases: {len(cases)}  ({', '.join(c['id'] for c in cases)})  [kind(s): {', '.join(case_kinds)}]")
    print(f"models under test: {len(models)}  ({', '.join(models)})")
    if ollama_models:
        print(f"  of which via Ollama Cloud: {len(ollama_models)}  ({', '.join(ollama_models)})")
    print(f"judges (always OpenRouter, regardless of generator provider): {len(judges)}  ({', '.join(judges)})")
    print(f"generation calls: {n_gen_calls}  (of which {n_ollama_gen_calls} are Ollama Cloud, 0 usage.cost, counted against --max-ollama-calls instead)")
    print(f"judge calls (3 judges x cases x models, minus self-judging): {total_judge_calls}")
    print(f"TOTAL API CALLS: {total_calls}")
    print(f"rough cost estimate for the OpenRouter side (NOT authoritative, real guard uses usage.cost): ${est_cost:.4f}")
    print(f"max-spend cap (OpenRouter dollars only): ${max_spend:.2f}")
    print(f"max-ollama-calls cap (Ollama Cloud call count, independent of dollars): {max_ollama_calls}")
    if n_ollama_gen_calls > max_ollama_calls:
        print(f"  WARNING: planned Ollama gen calls ({n_ollama_gen_calls}) exceed --max-ollama-calls ({max_ollama_calls}) -- run will abort partway.")

    if dry_run:
        print("\n--dry-run: zero API calls made.")
        return None

    guard = SpendGuard(max_spend)
    ollama_guard = OllamaCallGuard(max_ollama_calls)
    records = []
    aborted = False
    try:
        for case in cases:
            for model in models:
                provider, _ = parse_model_id(model)
                print(f"\n[gen] case={case['id']} model={model} provider={provider}")
                gen = generate_text(openrouter_key, ollama_key, model, case["system"], case["user"], max_tokens, temperature)
                gen["case_id"] = case["id"]
                if gen.get("ok"):
                    if provider == "ollama":
                        ollama_guard.add(f"gen {model}")
                    else:
                        guard.add(gen["cost"], f"gen {model}")
                    if case.get("kind") == "json":
                        jc = json_format_compliance(case, gen["output"])
                        gen["json_valid"] = jc["json_valid"]
                        gen["keys_ok"] = jc["keys_ok"]
                        gen["compliance_detail"] = jc["detail"]
                    else:
                        gen["word_count"] = word_count(gen["output"])
                        gen["tags_used"] = used_tags(gen["output"])
                        disallowed = [t for t in gen["tags_used"] if t not in case["allowed_tags"]]
                        gen["disallowed_tags"] = disallowed
                        gen["in_word_range"] = case["min_words"] <= gen["word_count"] <= case["max_words"]
                else:
                    print(f"  [FAIL] {model}: {gen['error']}")

                judge_records = []
                if gen.get("ok"):
                    eff_judges = [j for j in judges if j != model]
                    for judge in eff_judges:
                        print(f"  [judge] {judge} -> {model}/{case['id']}")
                        jrec = call_judge(openrouter_key, judge, case, gen["output"])
                        if jrec.get("ok"):
                            guard.add(jrec["cost"], f"judge {judge}")
                        else:
                            print(f"    [FAIL] judge {judge}: {jrec['error']}")
                        judge_records.append(jrec)

                records.append({"generation": gen, "judges": judge_records})
    except (SpendCapExceeded, OllamaCapExceeded):
        aborted = True

    print(f"\n=== TEXT run finished. aborted={aborted} openrouter_calls={guard.calls} openrouter_spend=${guard.total:.6f} ollama_calls={ollama_guard.calls}/{max_ollama_calls} ===")

    report = aggregate_text(records, case_kinds)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"text_run_{int(time.time())}.json"
    out_path.write_text(json.dumps({
        "records": records,
        "aggregate": report,
        "total_spend": guard.total,
        "openrouter_calls_made": guard.calls,
        "ollama_calls_made": ollama_guard.calls,
        "max_ollama_calls": max_ollama_calls,
        "aborted": aborted,
        "models": models,
        "judges": judges,
    }, indent=2))
    print(f"\nraw records written to {out_path}")

    print_text_table(report, case_kinds)
    return {"total_spend": guard.total, "ollama_calls": ollama_guard.calls, "out_path": str(out_path),
            "aborted": aborted, "report": report}


def aggregate_text(records, case_kinds=None):
    per_model = {}
    for rec in records:
        gen = rec["generation"]
        model = gen["model"]
        per_model.setdefault(model, {"cases": 0, "cost": 0.0, "latency": 0.0, "completion_tokens": 0,
                                      "reasoning_tokens": 0, "failures": 0, "judge_overalls": [], "spreads": [],
                                      "fmt1_ok": 0, "fmt2_ok": 0, "provider": gen.get("provider", "openrouter")})
        m = per_model[model]
        m["cases"] += 1
        if not gen.get("ok"):
            m["failures"] += 1
            continue
        m["cost"] += gen.get("cost", 0.0) or 0.0
        m["latency"] += gen.get("latency_s", 0.0) or 0.0
        m["completion_tokens"] += gen.get("completion_tokens") or 0
        m["reasoning_tokens"] += gen.get("reasoning_tokens") or 0
        if "json_valid" in gen:
            if gen.get("json_valid"):
                m["fmt1_ok"] += 1
            if gen.get("keys_ok"):
                m["fmt2_ok"] += 1
        else:
            if gen.get("in_word_range"):
                m["fmt1_ok"] += 1
            if not gen.get("disallowed_tags"):
                m["fmt2_ok"] += 1

        judge_overalls = []
        for jrec in rec["judges"]:
            if not jrec.get("ok"):
                continue
            scores = jrec["scores"]
            overall = sum(scores[a] for a in JUDGE_AXES) / len(JUDGE_AXES)
            judge_overalls.append(overall)
        if judge_overalls:
            m["judge_overalls"].append(sum(judge_overalls) / len(judge_overalls))
            m["spreads"].append(max(judge_overalls) - min(judge_overalls))

    # column labels: if every case is one kind, label precisely; if mixed, use generic labels
    if case_kinds == ["json"]:
        fmt1_label, fmt2_label = "json_valid", "required_keys"
    elif case_kinds == ["html"]:
        fmt1_label, fmt2_label = "word_range_compliance", "allowed_tags_compliance"
    else:
        fmt1_label, fmt2_label = "fmt1_compliance", "fmt2_compliance"

    report = {}
    for model, m in per_model.items():
        n_ok = m["cases"] - m["failures"]
        avg_cost = m["cost"] / n_ok if n_ok else 0.0
        avg_latency = m["latency"] / n_ok if n_ok else 0.0
        avg_completion_tokens = m["completion_tokens"] / n_ok if n_ok else 0.0
        avg_reasoning_tokens = m["reasoning_tokens"] / n_ok if n_ok else 0.0
        avg_score = sum(m["judge_overalls"]) / len(m["judge_overalls"]) if m["judge_overalls"] else None
        avg_spread = sum(m["spreads"]) / len(m["spreads"]) if m["spreads"] else None
        report[model] = {
            "provider": m["provider"],
            "cases_attempted": m["cases"],
            "failures": m["failures"],
            "avg_cost_per_call": avg_cost,
            "avg_latency_s": avg_latency,
            "avg_completion_tokens": avg_completion_tokens,
            "avg_reasoning_tokens": avg_reasoning_tokens,
            "avg_quality_score_1to5": avg_score,
            "avg_judge_spread": avg_spread,
            "spread_unreliable": (avg_spread is not None and avg_spread >= 1.5),
            "fmt1_label": fmt1_label,
            "fmt2_label": fmt2_label,
            "fmt1_compliance": f"{m['fmt1_ok']}/{n_ok}" if n_ok else "0/0",
            "fmt2_compliance": f"{m['fmt2_ok']}/{n_ok}" if n_ok else "0/0",
        }
    return report


def print_text_table(report, case_kinds=None):
    print("\n=== TEXT BENCHMARK RESULTS ===")
    fmt1_label = next(iter(report.values()))["fmt1_label"] if report else "fmt1_ok"
    fmt2_label = next(iter(report.values()))["fmt2_label"] if report else "fmt2_ok"
    headers = ["model", "provider", "score(1-5)", "judge_spread", "avg_cost", "avg_latency_s", "completion_tok", "reasoning_tok", fmt1_label, fmt2_label, "fail"]
    rows = []
    for model, r in report.items():
        score = f"{r['avg_quality_score_1to5']:.2f}" if r["avg_quality_score_1to5"] is not None else "n/a"
        spread = f"{r['avg_judge_spread']:.2f}" + (" *UNRELIABLE*" if r["spread_unreliable"] else "") if r["avg_judge_spread"] is not None else "n/a"
        rows.append([
            model, r["provider"], score, spread,
            f"${r['avg_cost_per_call']:.5f}", f"{r['avg_latency_s']:.2f}",
            f"{r['avg_completion_tokens']:.0f}", f"{r['avg_reasoning_tokens']:.0f}",
            r["fmt1_compliance"], r["fmt2_compliance"], str(r["failures"]),
        ])
    print_table(headers, rows)
    if any(r["spread_unreliable"] for r in report.values()):
        print("\nWARNING: one or more models have judge disagreement >= 1.5 (on a 1-5 scale).")
        print("The ranking for those models is NOT trustworthy as-is -- widen the judge panel or inspect raw outputs before acting on it.")


# ---------------------------------------------------------------------------
# Image benchmark
# ---------------------------------------------------------------------------

def png_dimensions(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None, None
    # IHDR chunk starts right after the 8-byte signature: 4-byte length, 4-byte "IHDR", then width(4) height(4)
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return width, height


def jpeg_dimensions(data):
    """Walk JPEG marker segments to the first SOF marker, which carries
    height/width. gemini-3.1-flash-lite-image returns JPEG -- the old
    PNG-only parser silently returned (None, None) for it (NonexNone in the
    results table)."""
    if data[0:2] != b"\xff\xd8":
        return None, None
    i, n = 2, len(data)
    sof_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while i < n - 1:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker == 0xFF:  # fill byte
            i += 1
            continue
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7 or marker in (0x00, 0x01):
            i += 2  # markers with no length field
            continue
        if i + 4 > n:
            break
        seg_len = int.from_bytes(data[i + 2:i + 4], "big")
        if marker in sof_markers:
            if i + 9 > n:
                break
            height = int.from_bytes(data[i + 5:i + 7], "big")
            width = int.from_bytes(data[i + 7:i + 9], "big")
            return width, height
        i += 2 + seg_len
    return None, None


def webp_dimensions(data):
    """Parse a RIFF/WEBP container's VP8X, VP8L, or lossy VP8 chunk for
    dimensions. meta/muse-image returns WebP -- the old PNG-only parser
    silently returned (None, None) for it (NonexNone in the results table)."""
    if data[0:4] != b"RIFF" or data[8:12] != b"WEBP" or len(data) < 20:
        return None, None
    fourcc = data[12:16]
    if fourcc == b"VP8X":
        if len(data) < 30:
            return None, None
        width = 1 + (data[24] | (data[25] << 8) | (data[26] << 16))
        height = 1 + (data[27] | (data[28] << 8) | (data[29] << 16))
        return width, height
    if fourcc == b"VP8L":
        if len(data) < 25 or data[20] != 0x2F:
            return None, None
        b0, b1, b2, b3 = data[21], data[22], data[23], data[24]
        width = 1 + (((b1 & 0x3F) << 8) | b0)
        height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
        return width, height
    if fourcc == b"VP8 ":
        if len(data) < 30 or data[23:26] != b"\x9d\x01\x2a":
            return None, None
        width = (data[26] | (data[27] << 8)) & 0x3FFF
        height = (data[28] | (data[29] << 8)) & 0x3FFF
        return width, height
    return None, None


def image_dimensions(data, media_type=None):
    """Sniff dimensions from raw image bytes -- checked against magic bytes
    first (authoritative), media_type used only to pick the file extension.
    Covers the 3 formats OpenRouter's image models are known to return:
    PNG (gemini-2.5-flash-image), JPEG (gemini-3.1-flash-lite-image), WebP
    (meta/muse-image). No Pillow -- stdlib header parsing only."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return png_dimensions(data)
    if data[:2] == b"\xff\xd8":
        return jpeg_dimensions(data)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return webp_dimensions(data)
    return None, None


def extension_for_media_type(media_type):
    return {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
    }.get((media_type or "").lower(), "bin")


def call_image(api_key, model, prompt, n=1):
    payload = {"model": model, "prompt": prompt, "n": n}
    resp, latency, err = http_post_json(IMAGES_URL, api_key, payload, timeout=180)
    record = {"model": model, "latency_s": round(latency, 3)}
    if err is not None:
        record.update({"ok": False, "error": err, "cost": 0.0})
        return record
    try:
        item = resp["data"][0]
        b64 = item["b64_json"]
        media_type = item.get("media_type", "image/png")
    except (KeyError, IndexError, TypeError):
        record.update({"ok": False, "error": {"status": None, "message": f"unexpected shape: {json.dumps(resp)[:500]}"}, "cost": 0.0})
        return record
    usage = resp.get("usage", {}) or {}
    cost = usage.get("cost", 0.0) or 0.0
    record.update({"ok": True, "b64": b64, "media_type": media_type, "cost": cost})
    return record


def run_image_bench(api_key, cases, models, max_spend, out_dir, images_dir, dry_run):
    total_calls = len(cases) * len(models)
    est_cost = total_calls * ROUGH_IMAGE_CALL_COST

    print("=== IMAGE BENCHMARK: planned matrix ===")
    print(f"cases: {len(cases)}  ({', '.join(c['id'] for c in cases)})")
    print(f"models under test: {len(models)}  ({', '.join(models)})")
    print(f"TOTAL API CALLS: {total_calls}")
    print(f"rough cost estimate (NOT authoritative, real guard uses usage.cost): ${est_cost:.4f}")
    print(f"max-spend cap: ${max_spend:.2f}")

    if dry_run:
        print("\n--dry-run: zero API calls made.")
        return None

    guard = SpendGuard(max_spend)
    records = []
    aborted = False
    images_dir.mkdir(parents=True, exist_ok=True)
    try:
        for case in cases:
            for model in models:
                print(f"\n[img] case={case['id']} model={model}")
                rec = call_image(api_key, model, case["prompt"])
                rec["case_id"] = case["id"]
                if rec.get("ok"):
                    guard.add(rec["cost"], f"image {model}")
                    raw = base64.b64decode(rec["b64"])
                    ext = extension_for_media_type(rec.get("media_type"))
                    fname = f"{case['id']}__{model.replace('/', '_')}.{ext}"
                    fpath = images_dir / fname
                    fpath.write_bytes(raw)
                    w, h = image_dimensions(raw, rec.get("media_type"))
                    rec["file_path"] = str(fpath)
                    rec["width"] = w
                    rec["height"] = h
                    if w and h:
                        aspect = w / h
                        rec["aspect_ratio"] = round(aspect, 4)
                        target = 16 / 9
                        rec["aspect_16x9_compliant"] = abs(aspect - target) <= 0.05 * target
                    else:
                        rec["aspect_ratio"] = None
                        rec["aspect_16x9_compliant"] = False
                    del rec["b64"]
                else:
                    print(f"  [FAIL] {model}: {rec['error']}")
                records.append(rec)
    except SpendCapExceeded:
        aborted = True

    print(f"\n=== IMAGE run finished. aborted_on_spend_cap={aborted} calls_made={guard.calls} total_spend=${guard.total:.6f} ===")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"image_run_{int(time.time())}.json"
    out_path.write_text(json.dumps({
        "records": records,
        "total_spend": guard.total,
        "calls_made": guard.calls,
        "aborted_on_spend_cap": aborted,
        "models": models,
    }, indent=2))
    print(f"\nraw records written to {out_path}")

    print_image_table(records)
    return {"total_spend": guard.total, "out_path": str(out_path), "aborted": aborted}


def print_image_table(records):
    print("\n=== IMAGE BENCHMARK RESULTS (no LLM judge -- inspect files by eye) ===")
    headers = ["case", "model", "ok", "cost", "latency_s", "widthxheight", "aspect", "16:9_ok", "file"]
    rows = []
    for r in records:
        if r.get("ok"):
            rows.append([
                r["case_id"], r["model"], "yes", f"${r['cost']:.5f}", f"{r['latency_s']:.2f}",
                f"{r['width']}x{r['height']}", str(r["aspect_ratio"]), str(r["aspect_16x9_compliant"]),
                r["file_path"],
            ])
        else:
            rows.append([r["case_id"], r["model"], "NO", "-", f"{r['latency_s']:.2f}", "-", "-", "-", str(r["error"])])
    print_table(headers, rows)


# ---------------------------------------------------------------------------
# shared table printer
# ---------------------------------------------------------------------------

def print_table(headers, rows):
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))
    fmt = " | ".join("{:<" + str(w) + "}" for w in widths)
    print(fmt.format(*headers))
    print("-+-".join("-" * w for w in widths))
    for row in rows:
        print(fmt.format(*[str(c) for c in row]))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def load_cases(path):
    return json.loads(Path(path).read_text())


def load_ollama_key(env_file):
    """OLLAMA_API_KEY, falling back to the first entry of comma-separated
    OLLAMA_API_KEYS. Same file-based loading as OPENROUTER_API_KEY -- never
    accepted on the command line."""
    env = load_env(env_file)
    key = env.get("OLLAMA_API_KEY")
    if key:
        return key
    keys_list = env.get("OLLAMA_API_KEYS", "")
    first = keys_list.split(",")[0].strip() if keys_list else ""
    return first or None


def build_parser():
    parser = argparse.ArgumentParser(description="Offline OpenRouter + Ollama Cloud model bench for Avada BLOG/APC workloads.")
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE, help="Path to .env containing OPENROUTER_API_KEY")
    parser.add_argument("--ollama-env-file", default=DEFAULT_OLLAMA_ENV_FILE,
                         help="Path to .env containing OLLAMA_API_KEY (and/or OLLAMA_API_KEYS) -- override to point at a different key source")
    parser.add_argument("--max-spend", type=float, default=0.50, help="Hard USD cap on accumulated OpenRouter usage.cost for this run (default 0.50). Does NOT bound Ollama Cloud -- see --max-ollama-calls.")
    parser.add_argument("--max-ollama-calls", type=int, default=DEFAULT_MAX_OLLAMA_CALLS,
                         help=f"Hard cap on Ollama Cloud call count for this run (default {DEFAULT_MAX_OLLAMA_CALLS}). Ollama Cloud has no usage.cost -- it's billed against a shared subscription quota, so --max-spend cannot protect it; this is the independent guard.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned matrix and cost estimate, make ZERO API calls")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Directory for JSON result files")
    parser.add_argument("--show-key-fingerprint", action="store_true", help="Print sha256(key)[:8] and key length for debugging (never the key itself)")

    sub = parser.add_subparsers(dest="command")

    p_text = sub.add_parser("text", help="Text benchmark: scored by a 3-judge panel (always via OpenRouter, regardless of generator provider)")
    p_text.add_argument("--cases-file", default=str(DEFAULT_TEXT_CASES))
    p_text.add_argument("--models", default=",".join(TEXT_MODELS_DEFAULT),
                         help="Comma-separated model ids under test. Prefix an id with 'ollama:' to route it to Ollama Cloud "
                              "(e.g. 'google/gemini-2.5-flash-lite,ollama:gemma4:31b') -- everything else goes to OpenRouter.")
    p_text.add_argument("--judges", default=",".join(JUDGES_DEFAULT), help="Comma-separated judge model ids (OpenRouter only -- judging never routes to Ollama)")
    p_text.add_argument("--limit-cases", type=int, default=None)
    p_text.add_argument("--max-tokens", type=int, default=700)
    p_text.add_argument("--temperature", type=float, default=0.7)

    p_img = sub.add_parser("image", help="Image benchmark: featured-image prompts, aspect-ratio compliance")
    p_img.add_argument("--cases-file", default=str(DEFAULT_IMAGE_CASES))
    p_img.add_argument("--models", default=",".join(IMAGE_MODELS_DEFAULT), help="Comma-separated model ids under test")
    p_img.add_argument("--limit-cases", type=int, default=None)
    p_img.add_argument("--images-dir", default=str(DEFAULT_IMAGES_DIR))

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.show_key_fingerprint:
        env = load_env(args.env_file)
        fp, ln = key_fingerprint(env.get("OPENROUTER_API_KEY", ""))
        print(f"OPENROUTER_API_KEY fingerprint: sha256[:8]={fp} length={ln}")
        ollama_key_probe = load_ollama_key(args.ollama_env_file)
        fp2, ln2 = key_fingerprint(ollama_key_probe or "")
        print(f"OLLAMA_API_KEY fingerprint: sha256[:8]={fp2} length={ln2} (from {args.ollama_env_file})")

    if args.command is None:
        if not args.dry_run:
            print("No subcommand given. Use 'text' or 'image' for a real run, or pass --dry-run to preview both matrices.", file=sys.stderr)
            sys.exit(2)
        # combined dry-run preview across both benchmarks using defaults, zero network calls
        text_cases = load_cases(DEFAULT_TEXT_CASES)
        image_cases = load_cases(DEFAULT_IMAGE_CASES)
        print("No subcommand given -- previewing BOTH benchmarks with default models/judges.\n")
        run_text_bench(None, None, text_cases, TEXT_MODELS_DEFAULT, JUDGES_DEFAULT, args.max_spend,
                        args.max_ollama_calls, 700, 0.7, Path(args.out_dir), dry_run=True)
        print()
        run_image_bench(None, image_cases, IMAGE_MODELS_DEFAULT, args.max_spend, Path(args.out_dir), DEFAULT_IMAGES_DIR, dry_run=True)
        return

    env = load_env(args.env_file)
    api_key = env.get("OPENROUTER_API_KEY")
    if not args.dry_run:
        if not api_key:
            print(f"ERROR: OPENROUTER_API_KEY not found in {args.env_file}", file=sys.stderr)
            sys.exit(1)
        fp, ln = key_fingerprint(api_key)
        print(f"Using OPENROUTER_API_KEY fingerprint sha256[:8]={fp} length={ln} (loaded from {args.env_file})")

    if args.command == "text":
        cases = load_cases(args.cases_file)
        if args.limit_cases:
            cases = cases[: args.limit_cases]
        models = [m.strip() for m in args.models.split(",") if m.strip()]
        judges = [j.strip() for j in args.judges.split(",") if j.strip()]

        ollama_key = None
        needs_ollama = any(parse_model_id(m)[0] == "ollama" for m in models)
        if needs_ollama:
            ollama_key = load_ollama_key(args.ollama_env_file)
            if not args.dry_run:
                if not ollama_key:
                    print(f"ERROR: OLLAMA_API_KEY / OLLAMA_API_KEYS not found in {args.ollama_env_file}", file=sys.stderr)
                    sys.exit(1)
                fpo, lno = key_fingerprint(ollama_key)
                print(f"Using OLLAMA_API_KEY fingerprint sha256[:8]={fpo} length={lno} (loaded from {args.ollama_env_file})")
            if any(j.startswith(OLLAMA_PREFIX) for j in judges):
                print("ERROR: judges must be OpenRouter models -- an 'ollama:' judge would break the shared judging scale.", file=sys.stderr)
                sys.exit(1)

        run_text_bench(api_key, ollama_key, cases, models, judges, args.max_spend, args.max_ollama_calls,
                        args.max_tokens, args.temperature, Path(args.out_dir), args.dry_run)

    elif args.command == "image":
        cases = load_cases(args.cases_file)
        if args.limit_cases:
            cases = cases[: args.limit_cases]
        models = [m.strip() for m in args.models.split(",") if m.strip()]
        run_image_bench(api_key, cases, models, args.max_spend, Path(args.out_dir), Path(args.images_dir), args.dry_run)


if __name__ == "__main__":
    main()
