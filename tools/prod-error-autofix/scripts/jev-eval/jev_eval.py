#!/usr/bin/env python3
"""Offline eval: can a cheap classifier decide `isInfra` before we spend an analyze session?

The label is the opus analyze verdict already on disk (`analysis.json:.analysis.isInfra`),
so this measures AGREEMENT WITH TODAY'S PIPELINE, not ground truth. That is the right
target: the point is to skip the session that produces that verdict, not to out-judge it.

State is restricted to what the daemon holds BEFORE the session runs -- the alert row and
the log window it already fetched. Feeding it anything the session itself discovered would
make the numbers meaningless.

  build   jobs/ + state.db      -> eval.jsonl
  run     eval.jsonl + provider -> preds.<provider>.jsonl
  score   preds                 -> confusion matrix + threshold sweep + sessions saved
"""
import argparse, json, os, sqlite3, sys, time, urllib.request, urllib.error
from pathlib import Path

CACHE = Path(os.path.expanduser(os.environ.get("AUTOFIX_CACHE_ROOT", "~/.cache/prod-autofix")))
HERE = Path(__file__).resolve().parent

# The alert snippet is capped at 700 chars by buildSlackPayload, so the log slice is what
# actually varies. 12 entries keeps a Jev call near 3k tokens (~$0.00013) and still shows
# whether the failures share one revision -- the tell for an infra cause.
MAX_LOG_ENTRIES = 12
MAX_STATE_CHARS = 12000

QUESTION_TEXT = (
    "This production error needs no code change because it is an infrastructure or capacity "
    "problem (out of memory, no available instance, container terminated, startup probe failed, "
    "deadline exceeded, cold-start admission failure, concurrency limit). "
    "A bug in the application's own code is NOT infrastructure."
)


def compact_log(entry):
    r = (entry.get("resource") or {}).get("labels") or {}
    out = {
        "severity": entry.get("severity"),
        "service": r.get("service_name") or r.get("function_name"),
        "revision": r.get("revision_name"),
        "ts": entry.get("timestamp"),
    }
    for k in ("textPayload", "jsonPayload", "protoPayload"):
        if entry.get(k):
            out[k] = json.loads(json.dumps(entry[k]))[:2000] if isinstance(entry[k], str) else entry[k]
            break
    hr = entry.get("httpRequest")
    if hr:
        out["http"] = {k: hr.get(k) for k in ("requestMethod", "requestUrl", "status", "latency") if hr.get(k)}
    return {k: v for k, v in out.items() if v is not None}


def build(args):
    db = sqlite3.connect(CACHE / "state.db")
    rows = {r[0]: r for r in db.execute(
        "select fingerprint,app_name,repo,service,kind,status,recurrence_count,signature from alerts")}
    best = {}
    for f in sorted((CACHE / "jobs").glob("*/*/analysis.json")):
        fp, att = f.parts[-3], int(f.parts[-2])
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        a = d.get("analysis") or {}
        if not isinstance(a.get("isInfra"), bool):
            continue
        if fp not in best or att > best[fp][0]:
            best[fp] = (att, d, a, f)

    n = 0
    with open(HERE / "eval.jsonl", "w") as out:
        for fp, (att, d, a, f) in sorted(best.items()):
            row = rows.get(fp)
            if not row:
                continue
            _, app, repo, service, kind, status, recur, sig = row
            try:
                logs = json.loads((f.parent / "logs.json").read_text())
            except Exception:
                logs = {}
            entries = (logs.get("errors") or [])[:MAX_LOG_ENTRIES]
            state = json.dumps({
                "app": app, "repo": repo, "service": service,
                "alert_message": sig, "occurrences": recur,
                "log_entries": [compact_log(e) for e in entries],
            }, ensure_ascii=False)[:MAX_STATE_CHARS]
            out.write(json.dumps({
                "fp": fp, "attempt": att, "app": app, "service": service,
                "regex_kind": kind, "status": status,
                "label_is_infra": a["isInfra"],
                "label_confidence": a.get("confidence"),
                "session_cost_usd": d.get("totalCostUsd") or 0.0,
                "state": state,
            }, ensure_ascii=False) + "\n")
            n += 1
    pos = sum(1 for l in open(HERE / "eval.jsonl") if json.loads(l)["label_is_infra"])
    print(f"eval.jsonl: {n} fingerprints, {pos} labelled infra ({pos/n:.1%}), {n-pos} app")


def read_key(names, path_env):
    """Accepts several env names because the key is filed under JEV_API_KEY in one
    place and TYPESAFE_API_KEY in the vendor's own docs."""
    if isinstance(names, str):
        names = [names]
    for n in names:
        if os.environ.get(n):
            return os.environ[n]
    p = os.environ.get(path_env) or str(HERE / f".{names[0].lower()}")
    if os.path.exists(p):
        txt = Path(p).read_text().strip()
        # A dotenv line wins over a bare-key file, so the same flag takes either shape.
        for line in txt.splitlines():
            line = line.strip().removeprefix("export ").strip()
            for n in names:
                if line.startswith(f"{n}="):
                    return line.split("=", 1)[1].strip().strip("\'\"")
        return txt
    sys.exit(f"no key: export {' or '.join(names)}, or put it in {p} (chmod 600)")


def ask_jev(state, key, model):
    body = json.dumps({
        "state": state,
        "model": model,
        "questions": {
            # Noul returns a bare probability; Choice returns the same call's confidence.
            # Both are free in one request, and which one thresholds better is the question.
            "is_infra": {"type": "noul", "instructions": QUESTION_TEXT},
            "kind": {"type": "choice", "instructions": "What kind of production error is this",
                     "criteria": {"app": "A defect in the application's own code",
                                  "infra": "An infrastructure or capacity problem; no code change would fix it"}},
        },
    }).encode()
    req = urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=body, method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
    ms = int((time.time() - t0) * 1000)
    ans = d.get("answers") or {}
    ch = ans.get("kind") or {}
    return {
        "p_infra": (ans.get("is_infra") or {}).get("noul"),
        "choice": ch.get("choice"),
        "choice_conf": ch.get("confidence"),
        "choice_p_infra": (ch.get("probabilities") or {}).get("infra"),
        "model": d.get("model"), "ms": ms, "usage": d.get("usage"),
    }


def ask_claude(state, key, model):
    body = json.dumps({
        "model": model, "max_tokens": 200,
        "system": "Answer with JSON only: {\"is_infra\": <true|false>, \"p_infra\": <0..1>}. No prose.",
        "messages": [{"role": "user", "content": f"{QUESTION_TEXT}\n\nState:\n{state}"}],
    }).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST",
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01",
                                          "Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read())
    ms = int((time.time() - t0) * 1000)
    txt = "".join(b.get("text", "") for b in d.get("content", []))
    s, e = txt.find("{"), txt.rfind("}")
    parsed = json.loads(txt[s:e + 1]) if s >= 0 < e else {}
    p = parsed.get("p_infra")
    return {
        "p_infra": float(p) if isinstance(p, (int, float)) else (1.0 if parsed.get("is_infra") else 0.0),
        "choice": "infra" if parsed.get("is_infra") else "app",
        "choice_conf": None, "choice_p_infra": None,
        "model": d.get("model"), "ms": ms, "usage": d.get("usage"),
    }


def ask_cli(state, key, model):
    """Baseline through the `claude` CLI so it bills the plan, not an API key -- the same
    path src/agent/claudeCli.ts already uses. `key` is unused."""
    import subprocess
    prompt = (f"{QUESTION_TEXT}\n\nState:\n{state}\n\n"
              "Reply with JSON only, no prose: {\"is_infra\": true|false, \"p_infra\": 0..1}")
    t0 = time.time()
    r = subprocess.run(["claude", "-p", "--model", model, prompt],
                       capture_output=True, text=True, timeout=180)
    ms = int((time.time() - t0) * 1000)
    if r.returncode != 0:
        raise RuntimeError(f"claude cli rc={r.returncode}: {r.stderr[:200]}")
    txt = r.stdout
    a, b = txt.find("{"), txt.rfind("}")
    parsed = json.loads(txt[a:b + 1]) if a >= 0 < b else {}
    p = parsed.get("p_infra")
    return {
        "p_infra": float(p) if isinstance(p, (int, float)) else (1.0 if parsed.get("is_infra") else 0.0),
        "choice": "infra" if parsed.get("is_infra") else "app",
        "choice_conf": None, "choice_p_infra": None,
        "model": model, "ms": ms, "usage": None,
    }


def run(args):
    items = [json.loads(l) for l in open(HERE / "eval.jsonl")]
    if args.limit:
        # Stratify so a truncated run keeps the real infra rate instead of whatever sorts first.
        pos = [i for i in items if i["label_is_infra"]]
        neg = [i for i in items if not i["label_is_infra"]]
        k = args.limit / len(items)
        items = pos[:max(1, round(len(pos) * k))] + neg[:max(1, round(len(neg) * k))]
    out_path = HERE / f"preds.{args.provider}.jsonl"
    done = set()
    if out_path.exists() and not args.fresh:
        done = {json.loads(l)["fp"] for l in open(out_path)}
    if args.provider == "jev":
        key, fn, model = read_key(["TYPESAFE_API_KEY", "JEV_API_KEY"], "TYPESAFE_API_KEY_FILE"), ask_jev, args.model or "jev-latest"
    elif args.provider == "cli":
        key, fn, model = None, ask_cli, args.model or "haiku"
    else:
        key, fn, model = read_key(["ANTHROPIC_API_KEY"], "ANTHROPIC_API_KEY_FILE"), ask_claude, args.model or "claude-haiku-4-5-20251001"
    todo = [i for i in items if i["fp"] not in done]
    print(f"{args.provider} / {model}: {len(todo)} to run ({len(done)} cached)")
    errs = 0
    with open(out_path, "a") as out:
        for n, it in enumerate(todo, 1):
            try:
                res = fn(it["state"], key, model)
            except urllib.error.HTTPError as e:
                errs += 1
                print(f"  [{n}] {it['fp']} HTTP {e.code}: {e.read()[:200].decode(errors='replace')}", file=sys.stderr)
                if e.code in (401, 403):
                    sys.exit("auth failed -- stopping")
                continue
            except Exception as e:
                errs += 1
                print(f"  [{n}] {it['fp']} {type(e).__name__}: {e}", file=sys.stderr)
                continue
            out.write(json.dumps({**{k: it[k] for k in
                      ("fp", "app", "regex_kind", "status", "label_is_infra", "session_cost_usd")}, **res}) + "\n")
            out.flush()
            if n % 25 == 0:
                print(f"  {n}/{len(todo)}")
    print(f"done -> {out_path}  ({errs} errors)")


def score(args):
    rows = [json.loads(l) for l in open(HERE / f"preds.{args.provider}.jsonl")]
    rows = [r for r in rows if r.get("p_infra") is not None]
    if not rows:
        sys.exit("no scorable predictions")
    lat = sorted(r["ms"] for r in rows if r.get("ms"))
    pos = sum(r["label_is_infra"] for r in rows)
    print(f"{args.provider}: {len(rows)} preds, {pos} infra / {len(rows)-pos} app")
    if lat:
        print(f"latency: median {lat[len(lat)//2]}ms  p90 {lat[int(.9*len(lat))]}ms  max {lat[-1]}ms")

    print("\n--- regex baseline (fingerprint.ts INFRA_ERROR_PATTERNS, free) ---")
    show_cm([(r["regex_kind"] == "infra", r["label_is_infra"], r) for r in rows])

    print(f"\n--- threshold sweep on p_infra ---")
    print("  predicted infra -> skip the opus session. FP = an APP bug sent to the infra lane,")
    print("  where allowMr:false makes it vanish. FP is the number that matters; FN only costs")
    print("  the session we already spend today.")
    print(f"{'thr':>6}{'recall':>9}{'prec':>8}{'FP!':>5}{'FN':>5}{'auto%':>8}{'saved$':>9}")
    for thr in (0.5, 0.7, 0.8, 0.9, 0.95, 0.98, 0.99):
        tp = sum(1 for r in rows if r["p_infra"] >= thr and r["label_is_infra"])
        fp_ = sum(1 for r in rows if r["p_infra"] >= thr and not r["label_is_infra"])
        fn = sum(1 for r in rows if r["p_infra"] < thr and r["label_is_infra"])
        rec = tp / (tp + fn) if tp + fn else 0
        prec = tp / (tp + fp_) if tp + fp_ else 0
        saved = sum(r["session_cost_usd"] for r in rows if r["p_infra"] >= thr and r["label_is_infra"])
        auto = (tp + fp_) / len(rows)
        print(f"{thr:>6.2f}{rec:>9.1%}{prec:>8.1%}{fp_:>5}{fn:>5}{auto:>8.1%}{saved:>9.2f}")
    napp = sum(1 for r in rows if not r["label_is_infra"])
    print(f"\nFP is measured against {napp} real app bugs. A usable threshold needs FP near 0 while")
    print("recall stays high enough to be worth wiring in at all.")

    if any(r.get("choice_conf") is not None for r in rows):
        print("\n--- choice arm (argmax), with its own confidence ---")
        show_cm([(r["choice"] == "infra", r["label_is_infra"], r) for r in rows])
        cc = [r for r in rows if r.get("choice_conf") is not None]
        print(f"\n{'conf band':>12}{'n':>6}{'agree':>8}")
        for lo, hi in ((0, .5), (.5, .7), (.7, .9), (.9, 1.01)):
            b = [r for r in cc if lo <= r["choice_conf"] < hi]
            if b:
                agree = sum((r["choice"] == "infra") == r["label_is_infra"] for r in b) / len(b)
                print(f"{f'{lo:.2f}-{hi:.2f}':>12}{len(b):>6}{agree:>8.1%}")
        print("calibrated means agreement rises monotonically with the band. If it does not, the confidence is decoration.")


def show_cm(triples):
    tp = sum(1 for p, l, _ in triples if p and l)
    fp_ = sum(1 for p, l, _ in triples if p and not l)
    fn = sum(1 for p, l, _ in triples if not p and l)
    tn = sum(1 for p, l, _ in triples if not p and not l)
    rec = tp / (tp + fn) if tp + fn else 0
    prec = tp / (tp + fp_) if tp + fp_ else 0
    print(f"  TP {tp}  FP {fp_}  FN {fn}  TN {tn}   recall {rec:.1%}  precision {prec:.1%}  acc {(tp+tn)/len(triples):.1%}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build").set_defaults(fn=build)
    r = sub.add_parser("run"); r.set_defaults(fn=run)
    r.add_argument("--provider", choices=("jev", "claude", "cli"), default="jev")
    r.add_argument("--model"); r.add_argument("--limit", type=int); r.add_argument("--fresh", action="store_true")
    s = sub.add_parser("score"); s.set_defaults(fn=score)
    s.add_argument("--provider", choices=("jev", "claude", "cli"), default="jev")
    a = ap.parse_args()
    a.fn(a)
