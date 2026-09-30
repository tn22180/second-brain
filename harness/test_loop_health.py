import os
import tempfile
import time
import unittest
from pathlib import Path

import loop_health as lh

NOW = time.mktime((2026, 9, 30, 12, 0, 0, 0, 0, -1))


class Checks(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.p = Path(self.d.name)

    def tearDown(self):
        self.d.cleanup()

    def touch(self, name, age_sec):
        f = self.p / name
        f.write_text("x")
        os.utime(f, (NOW - age_sec, NOW - age_sec))
        return f

    def test_file_fresh_uses_newest_of_list(self):
        self.touch("beat", 3600)
        self.touch("LOCK", 60)
        c = {"path": [str(self.p / "beat"), str(self.p / "LOCK")], "max_age": "10m"}
        self.assertIsNone(lh.check_file_fresh(c, NOW))

    def test_file_fresh_stale(self):
        self.touch("log", 2 * 86400)
        self.assertIn("stale 2d", lh.check_file_fresh({"path": str(self.p / "log"), "max_age": "26h"}, NOW))

    def test_file_missing_is_failure(self):
        self.assertIn("no file", lh.check_file_fresh({"path": str(self.p / "nope"), "max_age": "1h"}, NOW))

    def test_dated_file_reads_name_not_mtime(self):
        # billing rewrote 09-28 on 09-30: fresh mtime, stale content — must still fail at lag 3
        self.touch("gcp-cost-2026-09-27.md", 0)
        c = {"path": str(self.p / "gcp-cost-*.md"), "max_lag_days": 2}
        self.assertIn("3d old", lh.check_dated_file(c, NOW))
        self.touch("gcp-cost-2026-09-28.md", 0)
        self.assertIsNone(lh.check_dated_file(c, NOW))

    def test_expires(self):
        self.assertIn("3d left", lh.check_expires({"what": "t", "date": "2026-10-03", "warn_days": 7}, NOW))
        self.assertIn("expired", lh.check_expires({"what": "t", "date": "2026-09-29"}, NOW))
        self.assertIsNone(lh.check_expires({"date": "2026-12-01", "warn_days": 7}, NOW))

    def test_broken_check_fails_closed(self):
        cfg = {"loops": [{"name": "x", "checks": [{"kind": "file_fresh", "path": "/x", "max_age": "soon"}]}]}
        self.assertTrue(lh.run_checks(cfg, NOW)["x"])


class Decide(unittest.TestCase):
    R = 86400

    def test_first_failure_alerts_then_quiet(self):
        msgs, st = lh.decide({"a": ["boom"]}, {}, NOW, self.R)
        self.assertEqual(len(msgs), 1)
        msgs, st = lh.decide({"a": ["boom"]}, st, NOW + 3600, self.R)
        self.assertEqual(msgs, [])

    def test_changed_reason_realerts(self):
        _, st = lh.decide({"a": ["boom"]}, {}, NOW, self.R)
        msgs, _ = lh.decide({"a": ["other"]}, st, NOW + 60, self.R)
        self.assertEqual(len(msgs), 1)

    def test_still_failing_realerts_after_window(self):
        _, st = lh.decide({"a": ["boom"]}, {}, NOW, self.R)
        msgs, _ = lh.decide({"a": ["boom"]}, st, NOW + self.R, self.R)
        self.assertEqual(len(msgs), 1)

    def test_recovery_once(self):
        _, st = lh.decide({"a": ["boom"]}, {}, NOW, self.R)
        msgs, st = lh.decide({"a": []}, st, NOW + 60, self.R)
        self.assertEqual(msgs, ["✅ a: recovered"])
        msgs, _ = lh.decide({"a": []}, st, NOW + 120, self.R)
        self.assertEqual(msgs, [])


class Format(unittest.TestCase):
    def test_telegram_text_bold_title_escaped(self):
        self.assertEqual(lh.telegram_text(["🚨 brain: stale <2d>", "✅ jev: ok"]),
                         "<b>loop-health</b>\n🚨 brain: stale &lt;2d&gt;\n✅ jev: ok")


if __name__ == "__main__":
    unittest.main()
