#!/usr/bin/env python3
"""
resume-stuck-job engine.

Diagnose (read-only) or resume (writes to PROD) a stuck self-chaining Pub/Sub
fan-out job, driven by a recipe from recipes.json.

Usage:
    python3 resume.py <recipe-id> <jobId>              # READ-ONLY diagnosis
    python3 resume.py <recipe-id> <jobId> --execute    # perform the resume (PROD write)
    python3 resume.py --list                           # list available recipes

The resume = reset the one broken item back to its restart status, then publish
one Pub/Sub message so the chain dispatches itself onward. It never publishes a
message per item.

Auth: uses `gcloud auth print-access-token` for Firestore REST and `gcloud
pubsub topics publish` for the message. No firebase-admin / service account.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
RECIPES_PATH = os.path.join(HERE, "recipes.json")
FS_BASE = "https://firestore.googleapis.com/v1/projects/{proj}/databases/(default)/documents"


def die(msg, code=1):
    print("ERROR: " + msg)
    sys.exit(code)


def load_recipes():
    with open(RECIPES_PATH) as f:
        return json.load(f)


def gcloud_token():
    try:
        out = subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except subprocess.CalledProcessError as e:
        die("gcloud auth failed. Run `gcloud auth login` first.\n" + (e.stderr or ""))


def fs_get(proj, token, path):
    """GET a Firestore document or collection. Returns parsed JSON or None on 404."""
    url = FS_BASE.format(proj=proj) + "/" + path
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        die("Firestore GET %s -> HTTP %s\n%s" % (path, e.code, e.read().decode()[:500]))


def fs_run_query(proj, token, collection, shop_field, shop_id, limit=100):
    """runQuery: all docs in `collection` where shop_field == shop_id (no orderBy → no
    composite index needed). Returns a list of document objects."""
    url = FS_BASE.format(proj=proj) + ":runQuery"
    body = json.dumps({
        "structuredQuery": {
            "from": [{"collectionId": collection}],
            "where": {
                "fieldFilter": {
                    "field": {"fieldPath": shop_field},
                    "op": "EQUAL",
                    "value": {"stringValue": shop_id},
                }
            },
            "limit": limit,
        }
    }).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            rows = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        die("Firestore runQuery %s -> HTTP %s\n%s" % (collection, e.code, e.read().decode()[:500]))
    return [row["document"] for row in rows if "document" in row]


def fs_patch(proj, token, doc_path, fields):
    """PATCH selected fields of a Firestore document."""
    mask = "&".join("updateMask.fieldPaths=" + urllib.parse.quote(k) for k in fields)
    url = FS_BASE.format(proj=proj) + "/" + doc_path + "?" + mask
    body = json.dumps({"fields": fields}).encode()
    req = urllib.request.Request(
        url, data=body, method="PATCH",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        die("Firestore PATCH %s -> HTTP %s\n%s" % (doc_path, e.code, e.read().decode()[:500]))


def scalar(field):
    """Extract a plain value from a Firestore typed field object."""
    if field is None:
        return None
    if "stringValue" in field:
        return field["stringValue"]
    if "integerValue" in field:
        return int(field["integerValue"])
    if "booleanValue" in field:
        return field["booleanValue"]
    if "timestampValue" in field:
        return field["timestampValue"]
    if "nullValue" in field:
        return None
    if "arrayValue" in field:
        return [scalar(v) for v in field["arrayValue"].get("values", [])]
    return field


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def age_str(ts):
    if not ts:
        return "unknown"
    try:
        t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - t
        secs = int(delta.total_seconds())
        if secs < 90:
            return "%ds ago" % secs
        if secs < 5400:
            return "%dm ago" % (secs // 60)
        if secs < 172800:
            return "%dh ago" % (secs // 3600)
        return "%dd ago" % (secs // 86400)
    except Exception:
        return ts


def get_item_map(proj, token, r, job_id, job_fields):
    """Return {itemId: {status, updatedAt, doc_path}} for the recipe's item queue."""
    coll = r["collection"]
    sub = r["itemsSubcollection"]
    sfield = r["itemStatusField"]
    items = {}
    src = r["itemQueueSource"]

    def read_item(item_id, doc):
        f = (doc or {}).get("fields", {})
        items[item_id] = {
            "status": scalar(f.get(sfield)),
            "updatedAt": scalar(f.get("updatedAt")),
            "doc_path": "%s/%s/%s/%s" % (coll, job_id, sub, item_id),
        }

    if src == "subcollection":
        path = "%s/%s/%s?pageSize=300" % (coll, job_id, sub)
        page = fs_get(proj, token, path)
        for doc in (page or {}).get("documents", []):
            item_id = doc["name"].split("/")[-1]
            read_item(item_id, doc)
        # NOTE: caps at 300 items/one page; every recipe today is <= 50 items.
    elif src.startswith("jobField:"):
        field_name = src.split(":", 1)[1]
        ids = scalar(job_fields.get(field_name)) or []
        for item_id in ids:
            doc = fs_get(proj, token, "%s/%s/%s/%s" % (coll, job_id, sub, item_id))
            read_item(item_id, doc)
    else:
        die("unknown itemQueueSource: " + src)
    return items


def tally(items, r):
    from collections import Counter
    c = Counter(v["status"] for v in items.values())
    inprog = [i for i, v in items.items() if v["status"] in r["itemInProgressStatuses"]]
    pending = [i for i, v in items.items() if v["status"] in r["itemPendingStatuses"]]
    return c, inprog, pending


def fill_payload(template, job_id, item_id, shop):
    out = {}
    for k, v in template.items():
        out[k] = v.replace("$JOB", job_id).replace("$ITEM", item_id).replace("$SHOP", shop or "")
    return out


def diagnose(proj, token, r, job_id):
    """Return (ok_to_resume, target_item, action, payload) plus prints a report."""
    coll = r["collection"]
    job = fs_get(proj, token, "%s/%s" % (coll, job_id))
    banner = "=" * 64
    print(banner)
    print("RESUME DIAGNOSIS   recipe=%s" % r["_id"])
    print("TARGET: PRODUCTION  project=%s  (%s)" % (r["project"], r["app"]))
    print("collection=%s/%s  job=%s" % (coll, r["itemsSubcollection"], job_id))
    print(banner)
    if job is None:
        print("Job doc NOT FOUND. Wrong recipe or wrong job id?")
        return (False, None)

    jf = job.get("fields", {})
    job_status = scalar(jf.get(r["jobStatusField"]))
    shop = scalar(jf.get(r["shopFieldOnJob"]))
    updated = scalar(jf.get("updatedAt"))
    print("job.%s = %s   (updated %s)" % (r["jobStatusField"], job_status, age_str(updated)))
    print("shop = %s" % shop)

    if job_status in r["jobTerminalStatuses"]:
        print("\n-> Job already terminal (%s). Nothing to resume." % job_status)
        return (False, None)
    if job_status not in r["jobActiveStatuses"]:
        print("\n! job status %r is not an active status %s — unusual; inspect before resuming."
              % (job_status, r["jobActiveStatuses"]))

    items = get_item_map(proj, token, r, job_id, jf)
    if not items:
        print("\n-> No items in queue. Nothing to resume.")
        return (False, None)

    counts, inprog, pending = tally(items, r)
    print("\nitems (%d): %s" % (len(items), dict(counts)))

    stale_min = r.get("staleMinutes", STALE_MIN)
    target = None
    kind = None
    if inprog:
        target = sorted(inprog)[0]
        upd = items[target]["updatedAt"]
        if not is_stale(upd, stale_min):
            print("\n-> item %s is in-progress but FRESH (updated %s, < %dm stale threshold)."
                  % (target, age_str(upd), stale_min))
            print("   It is ACTIVELY PROCESSING, not stuck. Wait and re-check — do NOT resume.")
            print("   A manual kick now would run the same item twice in parallel.")
            print(banner)
            return (False, {"kind": "running"})
        kind = "stuck-in-progress"
        if len(inprog) > 1:
            print("! %d items in-progress %s — sequential chain expects 1. Handling first; review others."
                  % (len(inprog), sorted(inprog)))
    elif pending:
        target = sorted(pending)[0]
        kind = "chain-stopped-before-pending"
    else:
        print("\n-> No in-progress and no pending items, but job not terminal.")
        print("   All items reached a terminal state; the job doc was never finalized")
        print("   (likely a completed-counter drift). This needs manual review, not a")
        print("   blind re-kick. Escalate to engineering.")
        return (False, {"kind": "needs-review"})

    cur = items[target]["status"]
    restart = r["itemRestartStatus"]
    payload = fill_payload(r["payloadTemplate"], job_id, target, shop)
    ctx = {
        "kind": kind, "target": target, "cur": cur, "payload": payload,
        "pending": sorted(pending), "inprog": sorted(inprog),
        "job_fields": jf,
    }
    print("\nDIAGNOSIS: %s" % kind)
    print("broken link  : item %s  (status=%s, updated %s)"
          % (target, cur, age_str(items[target]["updatedAt"])))
    print("\nPLANNED RESUME — default (reprocess), 2 PROD writes to %s:" % r["project"])
    print("  1. Firestore: set item %s  %s -> %s" % (target, cur, restart))
    print("  2. Pub/Sub  : publish topic '%s'  msg=%s" % (r["topic"], json.dumps(payload)))
    if kind == "stuck-in-progress":
        print("\nALT — --skip-item (use when this item deterministically fails, e.g. repeats a")
        print("      timeout): mark item %s -> %s, bump %s, then advance to the next pending."
              % (target, r.get("itemErrorStatus", "error"), r.get("failCounterFields", [])))
    if r.get("mutatesShopify"):
        print("\n  ** this recipe WRITES to the merchant's Shopify store (idempotent overwrite) **")
    print(banner)
    return (True, ctx)


def execute(proj, token, r, job_id, target, payload):
    coll = r["collection"]
    doc_path = "%s/%s/%s/%s" % (coll, job_id, r["itemsSubcollection"], target)
    fields = {
        r["itemStatusField"]: {"stringValue": r["itemRestartStatus"]},
        "updatedAt": {"stringValue": now_iso()},
    }
    mask = [r["itemStatusField"], "updatedAt"]
    if r.get("itemErrorField"):
        fields[r["itemErrorField"]] = {"nullValue": None}
        mask.append(r["itemErrorField"])
    fs_patch(proj, token, doc_path, fields)
    print("[1/2] item %s reset -> %s" % (target, r["itemRestartStatus"]))

    msg = json.dumps(payload)
    try:
        out = subprocess.run(
            ["gcloud", "pubsub", "topics", "publish", r["topic"],
             "--project=" + proj, "--message=" + msg],
            capture_output=True, text=True, check=True,
        )
        print("[2/2] published to %s :: %s" % (r["topic"], out.stdout.strip()))
    except subprocess.CalledProcessError as e:
        die("pubsub publish failed:\n" + (e.stderr or e.stdout or ""))
    print("\nResume dispatched. Chain should self-continue. Poll the job doc to confirm.")


def execute_skip(proj, token, r, job_id, ctx):
    """Mark the stuck item errored, bump the job's fail counters, then advance the
    chain (kick the next pending item, or finalize the job if none remain).

    Absolute counter writes are safe here because a stuck job is not being written
    to by any live invocation — that stall is the precondition for skipping."""
    target = ctx["target"]
    coll = r["collection"]
    sub = r["itemsSubcollection"]
    ts = now_iso()

    # 1. mark the item errored (terminal) so the chain never waits on it again.
    doc_path = "%s/%s/%s/%s" % (coll, job_id, sub, target)
    err_status = r.get("itemErrorStatus", "error")
    fields = {
        r["itemStatusField"]: {"stringValue": err_status},
        "updatedAt": {"stringValue": ts},
    }
    mask = [r["itemStatusField"], "updatedAt"]
    if r.get("itemErrorField"):
        fields[r["itemErrorField"]] = {
            "stringValue": "Skipped by ops (resume-stuck-job): stuck in-progress past the "
                           "stale threshold, deterministic failure suspected."
        }
        mask.append(r["itemErrorField"])
    fs_patch(proj, token, doc_path, fields)
    print("[1/3] item %s marked %s (skipped)" % (target, err_status))

    # 2. bump fail counters on the job doc (absolute, read-modify-write).
    jf = ctx["job_fields"]
    counter_fields = r.get("failCounterFields", [])
    if counter_fields:
        jfields, jmask = {}, []
        for f in counter_fields:
            cur = scalar(jf.get(f)) or 0
            jfields[f] = {"integerValue": str(int(cur) + 1)}
            jmask.append(f)
        jfields["updatedAt"] = {"stringValue": ts}
        jmask.append("updatedAt")
        fs_patch(proj, token, "%s/%s" % (coll, job_id), jfields)
        print("[2/3] job counters bumped: %s" % ", ".join("%s+1" % f for f in counter_fields))
    else:
        print("[2/3] no fail counters configured — skipped")

    # 3. advance: kick the next pending item, else finalize the job.
    pending = [p for p in ctx["pending"] if p != target]
    other_inprog = [p for p in ctx["inprog"] if p != target]
    if pending:
        nxt = pending[0]
        fs_patch(proj, token, "%s/%s/%s/%s" % (coll, job_id, sub, nxt), {
            r["itemStatusField"]: {"stringValue": r["itemRestartStatus"]},
            "updatedAt": {"stringValue": ts},
        })
        shop = scalar(jf.get(r["shopFieldOnJob"]))
        payload = fill_payload(r["payloadTemplate"], job_id, nxt, shop)
        try:
            out = subprocess.run(
                ["gcloud", "pubsub", "topics", "publish", r["topic"],
                 "--project=" + proj, "--message=" + json.dumps(payload)],
                capture_output=True, text=True, check=True,
            )
            print("[3/3] advanced -> queued %s and published :: %s" % (nxt, out.stdout.strip()))
        except subprocess.CalledProcessError as e:
            die("pubsub publish failed:\n" + (e.stderr or e.stdout or ""))
        print("\nSkipped %s; chain resumes at %s." % (target, nxt))
    elif not other_inprog:
        done_status = r.get("jobDoneStatus")
        if done_status:
            fs_patch(proj, token, "%s/%s" % (coll, job_id), {
                r["jobStatusField"]: {"stringValue": done_status},
                "updatedAt": {"stringValue": ts},
            })
            print("[3/3] no pending items left — job %s -> %s (finalized)"
                  % (r["jobStatusField"], done_status))
        else:
            print("[3/3] no pending items and no jobDoneStatus configured — verify manually")
        print("\nSkipped %s; job complete (minus this item)." % target)
    else:
        print("[3/3] no pending, but other in-progress items remain %s — not finalizing."
              % other_inprog)
        print("\nSkipped %s; re-run diagnose to handle the remaining in-progress items." % target)


STALE_MIN = 15  # an in-progress item untouched this long is treated as stuck, not running


def is_stale(ts, minutes=STALE_MIN):
    if not ts:
        return False
    try:
        t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - t).total_seconds() > minutes * 60
    except Exception:
        return False


def cmd_jobs(proj, token, r, shop_id):
    """List every job in the recipe's collection for one shop (read-only)."""
    banner = "=" * 64
    print(banner)
    print("JOBS for shop %s   recipe=%s" % (shop_id, r["_id"]))
    print("project=%s (%s)  collection=%s" % (r["project"], r["app"], r["collection"]))
    print(banner)
    docs = fs_run_query(proj, token, r["collection"], r["shopFieldOnJob"], shop_id)
    if not docs:
        print("No jobs found for this shop.")
        return
    # newest first by createdAt (fallback updatedAt), sorted client-side.
    def sort_key(d):
        f = d.get("fields", {})
        return scalar(f.get("createdAt")) or scalar(f.get("updatedAt")) or ""
    docs.sort(key=sort_key, reverse=True)

    jstat = r["jobStatusField"]
    active = r["jobActiveStatuses"]
    show = ["completed", "total", "succeeded", "failed", "applyStatus", "appliedCount"]
    print("%-22s %-11s %-18s %-10s %s" % ("job id", jstat, "progress", "updated", "flag"))
    print("-" * 72)
    for d in docs:
        f = d.get("fields", {})
        jid = d["name"].split("/")[-1]
        st = scalar(f.get(jstat))
        prog = ""
        if scalar(f.get("total")) is not None:
            prog = "%s/%s" % (scalar(f.get("completed")), scalar(f.get("total")))
        upd = scalar(f.get("updatedAt"))
        flag = ""
        if st in active:
            flag = "MAYBE STUCK" if is_stale(upd) else "running"
        extra = " ".join(
            "%s=%s" % (k, scalar(f.get(k))) for k in show
            if k not in ("completed", "total") and scalar(f.get(k)) is not None
        )
        print("%-22s %-11s %-18s %-10s %-11s %s"
              % (jid, st, prog, age_str(upd), flag, extra))
    print(banner)
    print("Run diagnose on any flagged job:  python3 resume.py %s <job id>" % r["_id"])


def main():
    args = sys.argv[1:]
    recipes = load_recipes()
    if not args or args[0] == "--list":
        print("Available recipes:")
        for rid, r in recipes.items():
            print("  %-22s %s  [%s / %s]" % (rid, r["label"], r["app"], r["project"]))
        return

    if args[0] == "jobs":
        if len(args) < 3:
            die("usage: python3 resume.py jobs <recipe-id> <shopID>")
        rid, shop_id = args[1], args[2]
        if rid not in recipes:
            die("unknown recipe %r. Run `python3 resume.py --list`." % rid)
        r = recipes[rid]
        r["_id"] = rid
        cmd_jobs(r["project"], gcloud_token(), r, shop_id)
        return

    if len(args) < 2:
        die("usage: python3 resume.py <recipe-id> <jobId> [--execute] [--skip-item]"
            "  |  jobs <recipe-id> <shopID>")
    rid, job_id = args[0], args[1]
    flags = args[2:]
    do_execute = "--execute" in flags
    skip_item = "--skip-item" in flags
    if rid not in recipes:
        die("unknown recipe %r. Run `python3 resume.py --list`." % rid)
    r = recipes[rid]
    r["_id"] = rid
    token = gcloud_token()

    ok, ctx = diagnose(r["project"], token, r, job_id)
    if not do_execute:
        print("\n(read-only. Re-run with --execute AFTER CS confirms.  Add --skip-item to")
        print(" mark a deterministically-failing item errored and advance instead of retrying.)")
        return
    if not ok:
        die("diagnosis says nothing to resume — refusing to --execute.")
    if skip_item:
        if ctx["kind"] != "stuck-in-progress":
            die("--skip-item only applies to a stuck in-progress item (kind=%s)." % ctx["kind"])
        execute_skip(r["project"], token, r, job_id, ctx)
    else:
        execute(r["project"], token, r, job_id, ctx["target"], ctx["payload"])


if __name__ == "__main__":
    main()
