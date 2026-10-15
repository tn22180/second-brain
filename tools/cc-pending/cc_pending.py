#!/usr/bin/env python3
"""Find interactive Claude Code sessions left unfinished, report them, act on a reply.

Daily: Hermes cron runs `report` (--no-agent), stdout goes to Telegram verbatim.
Reply: the Hermes plugin `/cc` calls `command()` — `tiep N` resumes session N in a new Orca
tab, `don N` opens a fresh Claude session that removes worktree N if it is clean and pushed,
`bo N` drops N from the list until it sees new activity.

Stdlib only: it runs under Hermes' own Python (3.11), not a project venv.
"""
from __future__ import annotations

import glob
import json
import os
import re
import shlex
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Optional

HOME = Path.home()
PROJECTS = HOME / ".claude" / "projects"
STATE_FILE = Path(os.environ.get("CC_PENDING_STATE", HOME / ".cache" / "cc-pending" / "state.json"))
ORCA = "/Applications/Orca.app/Contents/Resources/bin/orca"
GIT = "/usr/bin/git"
SECOND_BRAIN = str(HOME / "Documents" / "second-brain")
# Same read token slack-thread-watch uses to open these sessions in the first place.
SLACK_TOKEN_FILE = HOME / "Projects" / "falcon-fix-bot" / "secrets" / "slack-bot.token"

MIN_IDLE_H = 3       # younger than this the session is probably still open in front of him
MAX_AGE_D = 7        # main checkout: older than this nobody is coming back to it
WORKTREE_MAX_AGE_D = 30  # a worktree still on disk is what needs clearing, however old
MAX_LIST = 20
MAX_SESSIONS = 6     # per worktree in the message; a long tail of retries says nothing more

DEFAULT_RESUME_MSG = ("Làm tiếp việc đang dở. Đọc lại trạng thái (git status, bước cuối trong "
                      "session) rồi tiếp; xong hoặc kẹt thì báo 1 dòng.")

Runner = Callable[[list], str]


def _run(argv: list, timeout: int = 60) -> str:
    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=True).stdout


@dataclass
class Session:
    sid: str
    cwd: str
    mtime: float
    title: str = ""          # Claude's ai-title or a /rename; empty for many short sessions
    prompt: str = ""         # first real prompt, the fallback subject
    last_role: str = ""      # "user" = turn never answered (interrupt, crash, tool mid-flight)
    api_error: bool = False  # last assistant entry is an API error — usually the rate limit
    older: list = field(default_factory=list)  # earlier sessions in the same cwd, newest first


@dataclass
class Item:
    sid: str
    cwd: str
    mtime: float
    title: str
    prompt: str = ""
    branch: str = ""
    main_path: str = ""
    linked: bool = False
    dirty: int = 0
    unpushed: int = 0
    reasons: list = field(default_factory=list)
    sessions: list = field(default_factory=list)  # every session in this cwd, newest first


# Entries with role "user" that are not a prompt: /exit, /clear and other local commands
# write these after the last answer, so they must not count as "a turn left unanswered".
_LOCAL_MARKERS = ("<command-name>", "<local-command-stdout>", "<local-command-stderr>",
                  "<local-command-caveat>")


def _is_local_command(entry: dict) -> bool:
    if entry.get("isMeta"):
        return True
    content = (entry.get("message") or {}).get("content")
    return isinstance(content, str) and content.lstrip().startswith(_LOCAL_MARKERS)


def _first_prompt(content) -> str:
    if not isinstance(content, str):
        return ""
    text = content.strip()
    if text.startswith("<command-message>"):
        # A slash command: the args say more than the command name.
        start = text.find("<command-args>")
        if start >= 0:
            text = text[start + len("<command-args>"):].split("</command-args>", 1)[0]
    return " ".join(text.split())[:300]


def read_session(path: str) -> Optional[Session]:
    """Metadata from one transcript; None when it is not an interactive session."""
    entrypoint = cwd = None
    title = first = ""
    last_role = ""
    api_error = False
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            entrypoint = d.get("entrypoint") or entrypoint
            cwd = d.get("cwd") or cwd
            kind = d.get("type")
            if kind == "ai-title":
                title = d.get("aiTitle") or title
            elif kind == "custom-title":
                title = d.get("customTitle") or title
            elif kind == "user":
                if _is_local_command(d):
                    continue
                if not first:
                    first = _first_prompt((d.get("message") or {}).get("content"))
                last_role = "user"
            elif kind == "assistant":
                last_role = "assistant"
                api_error = bool(d.get("isApiErrorMessage"))
    # `claude -p` (harness, autofix, bots) is "sdk-cli"; those are not his to resume.
    if entrypoint != "cli" or not cwd:
        return None
    return Session(sid=Path(path).stem, cwd=cwd, mtime=os.path.getmtime(path),
                   title=title, prompt=first, last_role=last_role, api_error=api_error)


def latest_per_cwd(projects: Path, now: float, max_age_d: float = MAX_AGE_D) -> dict:
    by_cwd: dict = {}
    for path in glob.glob(str(projects / "*" / "*.jsonl")):
        # harness/resume.py symlinks every session into the second-brain project dir.
        if os.path.islink(path) or not os.path.exists(path):
            continue
        if now - os.path.getmtime(path) > max_age_d * 86400:
            continue
        s = read_session(path)
        if s:
            by_cwd.setdefault(s.cwd, []).append(s)
    out = {}
    for cwd, sessions in by_cwd.items():
        sessions.sort(key=lambda x: x.mtime, reverse=True)
        latest = sessions[0]
        latest.older = sessions[1:]
        out[cwd] = latest
    return out


def git_info(cwd: str, run: Runner = _run) -> dict:
    """branch, linked-worktree flag, main checkout path, dirty files, commits on no remote."""
    def git(*args: str) -> str:
        try:
            return run([GIT, "-C", cwd, *args]).strip()
        except Exception:  # noqa: BLE001 — not a repo, or git refused; caller treats as plain dir
            return ""
    top = git("rev-parse", "--show-toplevel")
    if not top:
        return {}
    git_dir = os.path.realpath(os.path.join(cwd, git("rev-parse", "--git-dir")))
    common = os.path.realpath(os.path.join(cwd, git("rev-parse", "--git-common-dir")))
    dirty = git("status", "--porcelain")
    unpushed = git("rev-list", "--count", "HEAD", "--not", "--remotes")
    return {
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "linked": git_dir != common,
        "main_path": os.path.dirname(common),
        "dirty": len(dirty.splitlines()) if dirty else 0,
        "unpushed": int(unpushed) if unpushed.isdigit() else 0,
    }


def scan(projects: Path = PROJECTS, now: Optional[float] = None, dismissed: Optional[dict] = None,
         run: Runner = _run, min_idle_h: float = MIN_IDLE_H) -> list:
    now = now or time.time()
    dismissed = dismissed or {}
    items = []
    for cwd, s in latest_per_cwd(projects, now, WORKTREE_MAX_AGE_D).items():
        if now - s.mtime < min_idle_h * 3600:
            continue
        if not os.path.isdir(cwd):
            continue  # worktree already removed: that work is closed
        if dismissed.get(cwd, 0) >= s.mtime:
            continue
        g = git_info(cwd, run)
        if not g.get("linked") and now - s.mtime > MAX_AGE_D * 86400:
            continue
        reasons = []
        if g.get("linked"):
            reasons.append("worktree còn")
        if s.api_error:
            reasons.append("dừng vì API error")
        elif s.last_role == "user":
            reasons.append("turn cuối chưa trả lời")
        # A main checkout (second-brain is always dirty) is only unfinished when the session
        # itself stopped mid-turn; a linked worktree still existing is unfinished by itself.
        if not reasons:
            continue
        listed = [{"sid": x.sid, "title": x.title, "prompt": x.prompt, "mtime": x.mtime}
                  # In a main checkout the other sessions are unrelated work, not this one's history.
                  for x in ([s, *s.older] if g.get("linked") else [s])[:MAX_SESSIONS]]
        items.append(Item(sid=s.sid, cwd=cwd, mtime=s.mtime, title=s.title, prompt=s.prompt,
                          branch=g.get("branch", ""), main_path=g.get("main_path", ""),
                          linked=bool(g.get("linked")), dirty=g.get("dirty", 0),
                          unpushed=g.get("unpushed", 0), reasons=reasons, sessions=listed))
    items.sort(key=lambda i: i.mtime, reverse=True)
    return items[:MAX_LIST]


APP_LABELS = {
    "seo": "SEO", "blogs": "Blog", "llm-ai-search-seo": "AEO", "ai-product-copy": "APC",
    "avada-image-optimizer": "Image Opt", "product-feed": "Feed", "avachat": "Avachat",
    "joy": "Joy", "second-brain": "brain",
}

SPAWN_BRIEF = "Chạy không người trông"  # first words of SESSION_BRIEF/PROD_BRIEF in slack-thread-watch
_SLACK_URL = re.compile(r"https://\S*slack\.com/archives/\S+")
_URL = re.compile(r"https?://\S+")


def _app(it: Item) -> str:
    repo = os.path.basename((it.main_path or it.cwd).rstrip("/"))
    return APP_LABELS.get(repo, repo)


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit - 1].rstrip() + "…"


def _topic(title: str) -> str:
    """The session's subject without the URL noise a pasted Slack/MR link brings."""
    # slack-thread-watch appends a fixed brief after the permalink; it says nothing about the thread.
    title = title.split(SPAWN_BRIEF, 1)[0]
    text = _SLACK_URL.sub("🔗 Thread Slack", title)
    text = _URL.sub("🔗", text)
    return _clip(" ".join(text.replace("`", "'").split()), 70)


def _branch_words(branch: str) -> str:
    """fix/aeo-checklist-rating → "Aeo checklist rating"; Orca's slack-<app>-<ts> names nothing."""
    if not branch or branch in ("HEAD", "main", "master") or branch.startswith("slack-"):
        return ""
    words = re.sub(r"[-_]+", " ", branch.split("/", 1)[-1]).strip()
    return words[:1].upper() + words[1:]


def _session_title(sess: dict, it: Item) -> str:
    return _clip(sess.get("title") or _topic(sess.get("prompt", "")) or _branch_words(it.branch)
                 or "(không tiêu đề)", 60).replace("*", "")


def _headline(it: Item) -> str:
    # Several sessions: name the worktree by its branch, the session titles follow beneath.
    if len(it.sessions) > 1 and _branch_words(it.branch):
        return _clip(_branch_words(it.branch), 90)
    return _clip(it.title or _branch_words(it.branch) or _topic(it.prompt) or "(không tiêu đề)", 90)


def _idle(now: float, mtime: float) -> str:
    h = (now - mtime) / 3600
    return f"{h:.0f} giờ" if h < 48 else f"{h / 24:.0f} ngày"


def render(items: list, now: Optional[float] = None) -> str:
    """Telegram text, plain markdown (Hermes turns it into MarkdownV2); "" = send nothing."""
    if not items:
        return ""
    now = now or time.time()
    lines = [f"🧹 **Claude Code còn dở · {time.strftime('%d/%m', time.localtime(now))}**",
             f"{len(items)} chỗ, nghỉ từ {MIN_IDLE_H} giờ trở lên"]
    for n, it in enumerate(items, 1):
        lines.append("")
        lines.append(f"**{n}. {_headline(it).replace('*', '')}**")
        facts = [f"📦 {_app(it)}", f"💤 {_idle(now, it.mtime)}"]
        if it.dirty:
            facts.append(f"✏️ {it.dirty} file chưa commit")
        if it.unpushed:
            facts.append(f"⬆️ {it.unpushed} commit chưa push")
        if not it.linked:
            facts.append("⚠️ " + ", ".join(it.reasons))
        lines.append(" · ".join(facts))
        if it.branch and not it.branch.startswith("slack-") and it.branch not in ("main", "master"):
            lines.append(f"🌿 `{_clip(it.branch, 50)}`")
        if len(it.sessions) > 1:
            for k, sess in enumerate(it.sessions, 1):
                lines.append(f"  {n}.{k} {_session_title(sess, it)} · {_idle(now, sess['mtime'])}")
        lines.append(f"`/cc tiep {n}`  `/cc don {n}`  `/cc bo {n}`")
    lines += ["", "_tiep = làm tiếp (session mới nhất; `/cc tiep N.k` chọn session) · don = dọn worktree · "
              "bo = bỏ qua · chạm để copy_"]
    return "\n".join(lines)


_PERMALINK = re.compile(r"slack\.com/archives/([A-Z0-9]+)/p(\d{10})(\d{6})")
_SLACK_MARKUP = re.compile(r"<[^>|]*\|([^>]*)>|<[^>]*>")


def _clean_slack(text: str) -> str:
    return " ".join(_SLACK_MARKUP.sub(lambda m: m.group(1) or "", text).replace("•", " ").split())


def cs_title(text: str) -> str:
    """Subject of a CS support post ("Vấn đề chính" · shop), else its first real line."""
    shop = re.search(r"Shop URL:\s*<?https?://([a-z0-9-]+)\.myshopify\.com", text)
    issue = ""
    main = re.search(r"Vấn đề chính:\s*(.+)", text)
    if main:
        issue = main.group(1)
    else:
        after = text.split("Issue:", 1)
        lines = after[1].splitlines() if len(after) > 1 else text.splitlines()
        # Prod alerts open with ":red_circle: [SEO] <message>"; the shortcode is noise.
        issue = next((c for c in (re.sub(r":[a-z0-9_+-]+:", "", _clean_slack(l)).strip() for l in lines) if c), "")
    issue = _clip(_clean_slack(issue), 60)  # leave room for the shop inside the 90-char headline
    return " · ".join(x for x in (issue, shop.group(1) if shop else "") if x)


def _fetch_slack_post(channel: str, ts: str, token: str) -> str:
    q = urllib.parse.urlencode({"channel": channel, "ts": ts, "limit": 1})
    req = urllib.request.Request(f"https://slack.com/api/conversations.replies?{q}",
                                 headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    if not d.get("ok") or not d.get("messages"):
        return ""
    m = d["messages"][0]
    att = ["\n".join(filter(None, (a.get("pretext"), a.get("text"), a.get("fallback"))))
           for a in m.get("attachments") or []]
    return "\n".join([m.get("text", ""), *att])


def name_slack_sessions(items: list, cache: dict, fetch: Optional[Callable] = None) -> None:
    """Give untitled sessions opened from a Slack thread the thread's subject as title."""
    if fetch is None:
        try:
            token = SLACK_TOKEN_FILE.read_text().strip()
        except OSError:
            return
        fetch = lambda ch, ts: cs_title(_fetch_slack_post(ch, ts, token))  # noqa: E731
    for it in items:
        for sess in [it, *it.sessions]:
            get = (lambda k: getattr(sess, k)) if isinstance(sess, Item) else sess.get
            if get("title"):
                continue
            ref = _PERMALINK.search(get("prompt") or "")
            if not ref:
                continue
            key = f"{ref.group(1)}/{ref.group(2)}.{ref.group(3)}"
            if key not in cache:
                try:
                    cache[key] = fetch(ref.group(1), f"{ref.group(2)}.{ref.group(3)}")
                except Exception:  # noqa: BLE001 — a missing title must not cost the whole report
                    continue
            if cache[key]:
                if isinstance(sess, Item):
                    sess.title = cache[key]
                else:
                    sess["title"] = cache[key]


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, ValueError):
        return {"items": [], "dismissed": {}}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    tmp.replace(STATE_FILE)


def report(run: Runner = _run) -> str:
    state = load_state()
    items = scan(dismissed=state.get("dismissed"), run=run)
    name_slack_sessions(items, state.setdefault("slack_titles", {}))
    state["items"] = [asdict(i) for i in items]
    state["scanned_at"] = time.time()
    save_state(state)
    return render(items)


def _orca_paths(run: Runner) -> set:
    out = json.loads(run([ORCA, "worktree", "list", "--json"]))
    return {w["path"] for w in out.get("result", {}).get("worktrees", [])}


def _orca_target(item: dict, run: Runner) -> str:
    """An Orca worktree to host the tab; the command cds to the real cwd itself."""
    known = _orca_paths(run)
    for path in (item["cwd"], item.get("main_path") or "", SECOND_BRAIN):
        if path in known:
            return f"path:{path}"
    raise RuntimeError("Orca không quản path nào hợp lệ (orca worktree list)")


def _open_tab(target: str, title: str, shell_cmd: str, run: Runner) -> str:
    out = json.loads(run([ORCA, "terminal", "create", "--worktree", target, "--title", title,
                          "--command", shell_cmd, "--json"]))
    if not out.get("ok", True):
        raise RuntimeError(json.dumps(out.get("error", out))[:200])
    return (out.get("result") or {}).get("terminal", {}).get("handle", "") or "ok"


def resume_cmd(item: dict, msg: str) -> str:
    # `--resume` only finds the transcript from the session's own cwd.
    return (f"cd {shlex.quote(item['cwd'])} && exec claude --permission-mode auto "
            f"--resume {shlex.quote(item['sid'])} {shlex.quote(msg or DEFAULT_RESUME_MSG)}")


def clean_prompt(item: dict) -> str:
    cwd, main = item["cwd"], item.get("main_path") or ""
    return (
        f"Dọn worktree đã xong: {cwd} (branch {item.get('branch') or '?'}, repo chính {main}, "
        f"session cũ {item['sid']}). Không hỏi lại, làm đúng thứ tự:\n"
        f"1. `git -C {cwd} status --porcelain` và `git -C {cwd} log --oneline HEAD --not --remotes`. "
        "Còn file chưa commit hoặc commit chưa lên remote → KHÔNG xoá gì, in danh sách đó rồi dừng.\n"
        f"2. Sạch → đóng các tab Orca của worktree: `{ORCA} terminal list --json`, lọc "
        f"worktreePath == {cwd}, `{ORCA} terminal close --terminal <handle> --tab --json`.\n"
        f"3. `{ORCA} worktree rm --worktree path:{cwd} --json` (không --force). Orca không quản "
        f"worktree này → `git -C {main} worktree remove {cwd}` (không --force).\n"
        "4. Không xoá branch remote, không đụng transcript session. Kết quả: 1 dòng."
    )


def command(raw: str, run: Runner = _run) -> str:
    """Handler for `/cc ...` from Hermes. Returns the reply text."""
    parts = raw.strip().split(None, 2)
    if not parts:
        return report(run) or "Không còn session nào dở."
    verb = parts[0].lower()
    m = re.fullmatch(r"(\d+)(?:\.(\d+))?", parts[1]) if len(parts) > 1 else None
    if verb not in ("tiep", "don", "bo") or not m or (m.group(2) and verb != "tiep"):
        return "Dùng: /cc · /cc tiep N [lời nhắn] · /cc don N · /cc bo N"
    state = load_state()
    items = state.get("items") or []
    n = int(m.group(1))
    if not 1 <= n <= len(items):
        return f"Không có mục {n} (list hiện có {len(items)}). Gõ /cc để quét lại."
    item = items[n - 1]
    if m.group(2):
        k = int(m.group(2))
        sessions = item.get("sessions") or []
        if not 1 <= k <= len(sessions):
            return f"Mục {n} không có session {k} (có {len(sessions)})."
        item = {**item, "sid": sessions[k - 1]["sid"]}
    label = os.path.basename(item["cwd"].rstrip("/"))

    if verb == "bo":
        state.setdefault("dismissed", {})[item["cwd"]] = item["mtime"]
        save_state(state)
        return f"Đã bỏ #{n} {label} — hiện lại nếu session có hoạt động mới."

    try:
        if verb == "tiep":
            msg = parts[2] if len(parts) > 2 else ""
            handle = _open_tab(_orca_target(item, run), f"cc-tiep {label}"[:40],
                               resume_cmd(item, msg), run)
            return f"Mở tab Orca resume #{n} {label} (session {item['sid'][:8]}) · {handle}"
        if not item.get("linked"):
            state.setdefault("dismissed", {})[item["cwd"]] = item["mtime"]
            save_state(state)
            return f"#{n} {label} là checkout chính, không có worktree để xoá — đã bỏ khỏi list."
        shell = (f"cd {shlex.quote(item.get('main_path') or SECOND_BRAIN)} && exec claude "
                 f"--permission-mode auto {shlex.quote(clean_prompt(item))}")
        handle = _open_tab(_orca_target({**item, "cwd": ""}, run), f"cc-don {label}"[:40], shell, run)
        return f"Mở tab Orca dọn #{n} {label} — còn việc chưa push thì nó dừng, không xoá · {handle}"
    except subprocess.CalledProcessError as e:
        # orca puts its JSON error on stdout, not stderr.
        return f"Lỗi orca: {(e.stdout or e.stderr or str(e)).strip()[:300]}"
    except Exception as e:  # noqa: BLE001 — the reply is the only place he sees it
        return f"Lỗi: {e}"[:300]


def main(argv: list) -> int:
    if len(argv) > 1 and argv[1] == "cmd":
        print(command(" ".join(argv[2:])))
    else:
        out = report()
        if out:
            print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
