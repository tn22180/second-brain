import json
import os
import shlex
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

import cc_pending as cc

NOW = time.time()


def write_session(root: Path, name: str, entries: list, age_h: float, project="p") -> Path:
    d = root / project
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{name}.jsonl"
    p.write_text("\n".join(json.dumps(e) for e in entries) + "\n")
    t = NOW - age_h * 3600
    os.utime(p, (t, t))
    return p


def user(text, cwd, ep="cli", **kw):
    return {"type": "user", "cwd": cwd, "entrypoint": ep, "message": {"content": text}, **kw}


def assistant(cwd, **kw):
    return {"type": "assistant", "cwd": cwd, "entrypoint": "cli", "message": {"content": []}, **kw}


def git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


class ReadSessionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_exit_after_answer_is_not_unanswered(self):
        p = write_session(self.tmp, "a", [
            user("fix bug", "/x"), assistant("/x"),
            user("<command-name>/exit</command-name>", "/x"),
            user("<local-command-stdout>bye</local-command-stdout>", "/x"),
        ], 5)
        self.assertEqual(cc.read_session(str(p)).last_role, "assistant")

    def test_headless_skipped_and_title(self):
        p = write_session(self.tmp, "h", [user("x", "/x", ep="sdk-cli")], 5)
        self.assertIsNone(cc.read_session(str(p)))
        p = write_session(self.tmp, "t", [user("x", "/x"), {"type": "ai-title", "aiTitle": "SEO fix"}], 5)
        self.assertEqual(cc.read_session(str(p)).title, "SEO fix")

    def test_slash_command_title_uses_args(self):
        p = write_session(self.tmp, "s", [user(
            "<command-message>tony-wf</command-message>\n<command-name>/tony-wf</command-name>"
            "<command-args>jobs/brief.md</command-args>", "/x")], 5)
        self.assertEqual(cc.read_session(str(p)).prompt, "jobs/brief.md")

    def test_api_error(self):
        p = write_session(self.tmp, "e", [user("x", "/x"), assistant("/x", isApiErrorMessage=True)], 5)
        self.assertTrue(cc.read_session(str(p)).api_error)


class ScanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.projects = self.tmp / "projects"
        repo = self.tmp / "repo"
        repo.mkdir()
        git("init", "-q", "-b", "main", cwd=repo)
        git("-c", "user.email=a@b", "-c", "user.name=a", "commit", "-q", "--allow-empty", "-m", "i", cwd=repo)
        self.repo = str(repo.resolve())
        self.wt = str((self.tmp / "repo-wt-x").resolve())
        git("worktree", "add", "-q", "-b", "feat", self.wt, cwd=repo)
        Path(self.wt, "new.txt").write_text("x")

    def test_rules(self):
        write_session(self.projects, "wt", [user("feature", self.wt), assistant(self.wt)], 5)
        write_session(self.projects, "maindone", [user("q", self.repo), assistant(self.repo)], 5)
        write_session(self.projects, "fresh", [user("q", "/tmp")], 1)
        write_session(self.projects, "old", [user("q", "/tmp")], 24 * 9)
        write_session(self.projects, "oldmain", [user("q", self.repo)], 24 * 9)
        write_session(self.projects, "gone", [user("q", "/nope/gone")], 5)
        link = self.projects / "p" / "link.jsonl"
        os.symlink(self.projects / "p" / "wt.jsonl", link)
        items = cc.scan(self.projects, now=NOW)
        self.assertEqual([i.sid for i in items], ["wt"])
        it = items[0]
        self.assertTrue(it.linked)
        self.assertEqual(it.main_path, self.repo)
        self.assertEqual((it.branch, it.dirty, it.unpushed), ("feat", 1, 1))

    def test_old_worktree_still_listed(self):
        write_session(self.projects, "oldwt", [user("q", self.wt), assistant(self.wt)], 24 * 20)
        self.assertEqual([i.sid for i in cc.scan(self.projects, now=NOW)], ["oldwt"])

    def test_main_checkout_flagged_when_turn_unanswered(self):
        write_session(self.projects, "m", [user("q", self.repo), assistant(self.repo), user("tiếp", self.repo)], 5)
        write_session(self.projects, "other", [user("q2", self.repo), assistant(self.repo)], 8)
        items = cc.scan(self.projects, now=NOW)
        self.assertEqual(items[0].reasons, ["turn cuối chưa trả lời"])
        self.assertEqual([x["sid"] for x in items[0].sessions], ["m"])

    def test_latest_session_per_cwd_and_dismiss(self):
        write_session(self.projects, "older", [user("a", self.wt)], 30)
        write_session(self.projects, "newer", [user("b", self.wt)], 5)
        items = cc.scan(self.projects, now=NOW)
        self.assertEqual(items[0].sid, "newer")
        self.assertEqual([x["sid"] for x in items[0].sessions], ["newer", "older"])
        self.assertEqual(cc.scan(self.projects, now=NOW, dismissed={self.wt: items[0].mtime}), [])


class RenderTest(unittest.TestCase):
    def test_render(self):
        it = cc.Item(sid="s", cwd="/w/orca/slack-llm-ai-search-seo-1", mtime=NOW - 6 * 86400,
                     title="", prompt="https://avadaio.slack.com/archives/G01/p17 Chạy không người trông, đừng dừng", branch="fix/aeo",
                     main_path="/w/llm-ai-search-seo", linked=True, dirty=3, reasons=["worktree còn"])
        out = cc.render([it], NOW)
        self.assertIn("**1. Aeo**", out)
        self.assertIn("📦 AEO · 💤 6 ngày · ✏️ 3 file chưa commit", out)
        self.assertIn("🌿 `fix/aeo`", out)
        it.title = "Sửa rating AEO"
        self.assertIn("**1. Sửa rating AEO**", cc.render([it], NOW))
        it.title, it.branch = "", "slack-seo-1"
        self.assertIn("**1. 🔗 Thread Slack**", cc.render([it], NOW))
        self.assertIn("`/cc tiep 1`", out)
        self.assertEqual(cc.render([], NOW), "")
        it.title, it.branch = "", "fix/aeo"
        it.sessions = [{"sid": "a", "title": "Sửa rating", "prompt": "", "mtime": NOW - 7200},
                       {"sid": "b", "title": "", "prompt": "check thread https://x.y/z", "mtime": NOW - 86400}]
        out = cc.render([it], NOW)
        self.assertIn("**1. Aeo**", out)
        self.assertIn("  1.1 Sửa rating · 2 giờ", out)
        self.assertIn("  1.2 check thread 🔗 · 24 giờ", out)


class SlackTitleTest(unittest.TestCase):
    POST = ("<@U1> <@U2>\nApp: SEO On AEO\nShop URL: <https://kjewelry.myshopify.com>\n"
            "Ticket: <https://helpdesk.avada.net/t/AEO-1>\nIssue:\n• Vấn đề chính: Re-scan vẫn báo thiếu "
            "<https://x.y|review>\n• Mong muốn: fix")

    def test_cs_title(self):
        self.assertEqual(cc.cs_title(self.POST), "Re-scan vẫn báo thiếu review · kjewelry")
        self.assertEqual(cc.cs_title("Issue:\nKhông lưu được meta"), "Không lưu được meta")
        self.assertEqual(cc.cs_title(":red_circle: [SEO] HTTP 500 POST /"), "[SEO] HTTP 500 POST /")

    def test_name_slack_sessions_fills_untitled_and_caches(self):
        prompt = "https://avadaio.slack.com/archives/G01N5G8D562/p1791461013183269 Chạy không người trông"
        it = cc.Item(sid="s", cwd="/w", mtime=1, title="", prompt=prompt,
                     sessions=[{"sid": "s", "title": "", "prompt": prompt, "mtime": 1},
                               {"sid": "t", "title": "Có sẵn", "prompt": prompt, "mtime": 0}])
        calls, cache = [], {}
        fetch = lambda ch, ts: calls.append((ch, ts)) or "Re-scan lỗi · shop"
        cc.name_slack_sessions([it], cache, fetch)
        self.assertEqual(it.title, "Re-scan lỗi · shop")
        self.assertEqual([x["title"] for x in it.sessions], ["Re-scan lỗi · shop", "Có sẵn"])
        self.assertEqual(calls, [("G01N5G8D562", "1791461013.183269")])


class CommandTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        cc.STATE_FILE = self.tmp / "state.json"
        self.item = {"sid": "abc123", "cwd": "/w/seo-wt-x", "mtime": 1.0, "title": "t", "branch": "feat",
                     "main_path": "/w/seo", "linked": True, "dirty": 0, "unpushed": 0, "reasons": [],
                     "sessions": [{"sid": "abc123", "title": "a", "prompt": "", "mtime": 1.0},
                                  {"sid": "old999", "title": "b", "prompt": "", "mtime": 0.5}]}
        cc.save_state({"items": [self.item, {**self.item, "cwd": "/w/seo", "linked": False}], "dismissed": {}})
        self.calls = []

    def runner(self, argv):
        self.calls.append(argv)
        if argv[1:3] == ["worktree", "list"]:
            return json.dumps({"result": {"worktrees": [{"path": "/w/seo"}]}})
        return json.dumps({"ok": True, "result": {"terminal": {"handle": "term_1"}}})

    def test_tiep_quotes_message_and_falls_back_to_main(self):
        out = cc.command("tiep 1 làm nốt; rm -rf ~", self.runner)
        self.assertIn("term_1", out)
        create = self.calls[-1]
        self.assertEqual(create[create.index("--worktree") + 1], "path:/w/seo")
        shell = create[create.index("--command") + 1]
        self.assertEqual(shlex.split(shell)[-1], "làm nốt; rm -rf ~")
        self.assertIn("--resume abc123", shell)
        self.assertTrue(shell.startswith("cd /w/seo-wt-x && "))

    def test_tiep_picks_older_session(self):
        cc.command("tiep 1.2", self.runner)
        self.assertIn("--resume old999", self.calls[-1][self.calls[-1].index("--command") + 1])
        self.assertIn("không có session 3", cc.command("tiep 1.3", self.runner))
        self.assertIn("Dùng:", cc.command("don 1.2", self.runner))

    def test_don_spawns_fresh_session_in_main(self):
        cc.command("don 1", self.runner)
        shell = self.calls[-1][self.calls[-1].index("--command") + 1]
        self.assertNotIn("--resume", shell)
        self.assertIn("worktree rm --worktree path:/w/seo-wt-x", shell)
        self.assertNotIn("--force --json", shell)

    def test_don_on_main_checkout_only_dismisses(self):
        out = cc.command("don 2", self.runner)
        self.assertIn("checkout chính", out)
        self.assertEqual(self.calls, [])
        self.assertIn("/w/seo", cc.load_state()["dismissed"])

    def test_bad_input(self):
        self.assertIn("Dùng:", cc.command("xoa 1", self.runner))
        self.assertIn("Không có mục 9", cc.command("tiep 9", self.runner))

    def test_orca_error_surfaces_stdout(self):
        def boom(argv):
            if argv[1:3] == ["worktree", "list"]:
                return self.runner(argv)
            raise subprocess.CalledProcessError(1, argv, output='{"error":"repo_not_found"}')
        self.assertIn("repo_not_found", cc.command("tiep 1", boom))


if __name__ == "__main__":
    unittest.main()
