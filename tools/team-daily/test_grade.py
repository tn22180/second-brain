import json
import unittest
from pathlib import Path
from unittest.mock import patch

import grade


def record(text, index=0):
    return {"ts": f"2026-10-14T{index:06d}", "session": str(index % 3),
            "len": len(text), "text": text}


def answer(level=3.5):
    return {"level": level, "evidence": ["2b: dùng /tony-wf"],
            "warnings": [], "advice": "Nêu tiêu chí hoàn tất.", "confidence": "vừa"}


def payload(prompt):
    return json.loads(prompt.split("\nDỮ LIỆU JSON:\n", 1)[1])


class PromptTests(unittest.TestCase):
    def test_truncation_and_counts(self):
        data = payload(grade.build_prompt("tuannv", [record("x" * 900), record("ok", 1)], 1234567))
        self.assertEqual(data["prompts"][0]["text"], "x" * 600)
        self.assertEqual(data["prompt_count"], 2)
        self.assertEqual(data["session_count"], 2)
        self.assertEqual(data["tokens"], "1.23M")
        self.assertEqual(data["sample_size"], 2)

    def test_even_sample_and_total_limit(self):
        prompts = [record(str(i) + "x" * 800, i) for i in range(1000)]
        prompt = grade.build_prompt("tuannv", prompts, None)
        data = payload(prompt)
        sampled = data["prompts"]
        self.assertLessEqual(len(prompt), 60000)
        self.assertLess(len(sampled), len(prompts))
        self.assertEqual(data["sample_size"], len(sampled))
        self.assertEqual(data["prompt_count"], 1000)
        self.assertEqual(sampled[0]["ts"], prompts[0]["ts"])
        self.assertEqual(sampled[-1]["ts"], prompts[-1]["ts"])
        indices = [int(p["text"].split("x")[0]) for p in sampled]
        gaps = [b - a for a, b in zip(indices, indices[1:])]
        self.assertLessEqual(max(gaps) - min(gaps), 1)
        self.assertTrue(all(len(p["text"]) <= 600 for p in sampled))


class GradeTests(unittest.TestCase):
    def invoke(self, output, prompts=None):
        calls = []

        def run(argv, input_text, cwd):
            calls.append((argv, input_text, cwd))
            return output

        with patch.object(Path, "mkdir"):
            result = grade.grade("tuannv", prompts or [record("/tony-wf")], 100, run=run)
        return result, calls

    def test_empty_without_model_or_directory(self):
        with patch.object(Path, "mkdir") as mkdir:
            result = grade.grade("tuannv", [], None, run=lambda *args: self.fail("called model"))
        mkdir.assert_not_called()
        self.assertEqual(result, {"level": None, "evidence": [], "warnings": [],
                                  "advice": "", "confidence": "", "sample_size": 0})

    def test_structured_output_and_invocation(self):
        result, calls = self.invoke(json.dumps({"structured_output": answer()}))
        self.assertEqual(result, dict(answer(), sample_size=1))
        argv, stdin, cwd = calls[0]
        self.assertEqual(argv, ["claude", "-p", "--model", "sonnet", "--output-format", "json",
                                "--tools", "", "--max-turns", "2", "--json-schema", json.dumps(grade.JSON_SCHEMA)])
        self.assertIn("/tony-wf", stdin)
        self.assertNotIn("/tony-wf", " ".join(argv))
        self.assertEqual(Path(cwd), Path.home() / ".cache/team-daily/grader")

    def test_result_fences_and_nested_braces(self):
        expected = answer()
        expected["advice"] = "Kiểm tra {output} trước khi xong."
        result, _ = self.invoke(json.dumps({"result": "```json\n" + json.dumps(expected) + "\n```"}))
        self.assertEqual(result, dict(expected, sample_size=1))

    def test_clamp(self):
        for value, expected in [(-2, 1), (9, 7)]:
            with self.subTest(value=value):
                result, _ = self.invoke(json.dumps({"structured_output": answer(value)}))
                self.assertEqual(result["level"], expected)

    def test_sample_size_matches_model_input(self):
        prompts = [record("x" * 800, i) for i in range(1000)]
        result, calls = self.invoke(json.dumps({"structured_output": answer()}), prompts)
        self.assertEqual(result["sample_size"], len(payload(calls[0][1])["prompts"]))
        self.assertLess(result["sample_size"], len(prompts))

    def test_invalid_output(self):
        bad = ["not JSON", "[]", "{}", json.dumps({"result": "no object"})]
        for key, value in [("level", True), ("level", "3"), ("level", 2.2),
                           ("level", float("nan")), ("evidence", "bad"),
                           ("warnings", [1]), ("advice", None), ("confidence", "sure")]:
            item = answer()
            item[key] = value
            bad.append(json.dumps({"structured_output": item}))
        for output in bad:
            with self.subTest(output=output), self.assertRaises(ValueError):
                self.invoke(output)
        with self.assertRaisesRegex(ValueError, "not JSON"):
            self.invoke("not JSON")

    def test_default_subprocess(self):
        with patch.object(Path, "mkdir") as mkdir, patch.object(grade.subprocess, "run") as run:
            run.return_value.stdout = json.dumps({"structured_output": answer()})
            grade.grade("tuannv", [record("hello")], None)
        mkdir.assert_called_once_with(parents=True, exist_ok=True)
        kwargs = run.call_args.kwargs
        self.assertEqual(kwargs["timeout"], 600)
        self.assertTrue(kwargs["capture_output"] and kwargs["text"] and kwargs["check"])
        self.assertIn("hello", kwargs["input"])


if __name__ == "__main__":
    unittest.main()
