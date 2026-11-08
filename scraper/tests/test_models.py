import unittest
from dataclasses import FrozenInstanceError

from scraper.models import JOB_FIELDS, CompanyResult, Job, make_job_id


def sample_job(**overrides):
    values = dict(
        id="greenhouse:stripe:1",
        company="Stripe",
        ats="greenhouse",
        title="Software Engineer, New Grad",
        location="Toronto",
        type="newgrad",
        posted_at="2026-10-01T15:05:36Z",
        url="https://stripe.com/jobs/search?gh_jid=1",
        source="Greenhouse feed",
        description_text="Build things.",
        compensation=None,
        department="Engineering",
    )
    values.update(overrides)
    return Job(**values)


class JobIdTest(unittest.TestCase):
    def test_format(self):
        self.assertEqual(make_job_id("lever", "palantir", "abc-123"), "lever:palantir:abc-123")

    def test_posting_id_is_stringified_and_stripped(self):
        self.assertEqual(make_job_id("greenhouse", "stripe", 8194287), "greenhouse:stripe:8194287")
        self.assertEqual(make_job_id("ashby", "ramp", "  x  "), "ashby:ramp:x")

    def test_rejects_empty_parts(self):
        with self.assertRaises(ValueError):
            make_job_id("ashby", "ramp", "")
        with self.assertRaises(ValueError):
            make_job_id("ashby", "", "x")
        with self.assertRaises(ValueError):
            make_job_id("ashby", "ramp", None)


class JobTest(unittest.TestCase):
    def test_is_immutable(self):
        job = sample_job()
        with self.assertRaises(FrozenInstanceError):
            job.title = "changed"  # type: ignore[misc]

    def test_to_dict_has_exact_contract_keys(self):
        data = sample_job().to_dict()
        self.assertEqual(tuple(data.keys()), JOB_FIELDS)
        self.assertEqual(
            JOB_FIELDS,
            (
                "id", "company", "ats", "title", "location", "type", "posted_at", "url",
                "source", "description_text", "compensation", "department",
            ),
        )

    def test_rejects_invalid_type(self):
        with self.assertRaises(ValueError):
            sample_job(type="senior")

    def test_rejects_unknown_ats(self):
        with self.assertRaises(ValueError):
            sample_job(ats="linkedin")

    def test_rejects_non_http_url(self):
        with self.assertRaises(ValueError):
            sample_job(url="javascript:alert(1)")


class CompanyResultTest(unittest.TestCase):
    def test_to_dict(self):
        result = CompanyResult(company="Stripe", ats="greenhouse", ok=True, error=None, jobs=(sample_job(),))
        data = result.to_dict()
        self.assertEqual(list(data.keys()), ["company", "ats", "ok", "error", "jobs"])
        self.assertEqual(data["jobs"][0]["id"], "greenhouse:stripe:1")

    def test_failed_result_has_no_jobs(self):
        result = CompanyResult.failure("Stripe", "greenhouse", "boom")
        self.assertEqual(result.to_dict(), {
            "company": "Stripe", "ats": "greenhouse", "ok": False, "error": "boom", "jobs": [],
        })


if __name__ == "__main__":
    unittest.main()
