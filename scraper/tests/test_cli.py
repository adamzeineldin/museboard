import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from scraper import cli

CONFIG = {"companies": [
    {"name": "Stripe", "ats": "greenhouse", "board": "stripe"},
    {"name": "Ramp", "ats": "ashby", "board": "ramp"},
]}


def fake_result(companies, ok=True):
    return {
        "run_at": "2026-11-07T12:00:00Z",
        "companies": [
            {"company": c.name, "ats": c.ats, "ok": ok, "error": None if ok else "boom", "jobs": []}
            for c in companies
        ],
    }


class CliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.config_path = Path(self.tmp.name) / "companies.json"
        self.config_path.write_text(json.dumps(CONFIG), encoding="utf-8")

    def invoke(self, argv, ok=True):
        captured = {}

        def fake_run(companies, client, include_all=False, max_workers=4):
            captured["companies"] = companies
            captured["include_all"] = include_all
            return fake_result(companies, ok=ok)

        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.object(cli, "run_scrape", side_effect=fake_run):
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = cli.main(argv)
        return code, stdout.getvalue(), stderr.getvalue(), captured

    def test_prints_json_to_stdout_by_default(self):
        code, out, _, captured = self.invoke(["--companies", str(self.config_path)])
        self.assertEqual(code, 0)
        data = json.loads(out)
        self.assertEqual([c["company"] for c in data["companies"]], ["Stripe", "Ramp"])
        self.assertFalse(captured["include_all"])

    def test_writes_to_file(self):
        out_path = Path(self.tmp.name) / "out" / "jobs.json"
        code, out, _, _ = self.invoke(["--companies", str(self.config_path), "--out", str(out_path)])
        self.assertEqual(code, 0)
        self.assertEqual(out, "")
        self.assertEqual(json.loads(out_path.read_text(encoding="utf-8"))["run_at"], "2026-11-07T12:00:00Z")

    def test_company_filter_is_case_insensitive(self):
        code, _, _, captured = self.invoke(["--companies", str(self.config_path), "--company", "ramp"])
        self.assertEqual(code, 0)
        self.assertEqual([c.name for c in captured["companies"]], ["Ramp"])

    def test_unknown_company_is_a_usage_error(self):
        code, out, err, _ = self.invoke(["--companies", str(self.config_path), "--company", "LinkedIn"])
        self.assertEqual(code, 2)
        self.assertEqual(out, "")
        self.assertIn("LinkedIn", err)

    def test_invalid_config_is_a_usage_error(self):
        self.config_path.write_text('{"companies": [{"name": "X", "ats": "linkedin"}]}', encoding="utf-8")
        code, _, err, _ = self.invoke(["--companies", str(self.config_path)])
        self.assertEqual(code, 2)
        self.assertIn("config", err.lower())

    def test_all_companies_failed_exits_1_but_still_prints(self):
        code, out, _, _ = self.invoke(["--companies", str(self.config_path)], ok=False)
        self.assertEqual(code, 1)
        self.assertEqual(len(json.loads(out)["companies"]), 2)

    def test_include_all_flag(self):
        _, _, _, captured = self.invoke(["--companies", str(self.config_path), "--include-all"])
        self.assertTrue(captured["include_all"])


if __name__ == "__main__":
    unittest.main()
