import json
import tempfile
import unittest
from pathlib import Path

from scraper.allowlist import is_allowed_url
from scraper.ats import build_listing_url
from scraper.config import load_companies, parse_companies, slugify
from scraper.errors import ConfigError

REPO_COMPANIES = Path(__file__).resolve().parents[1] / "companies.json"


class SlugifyTest(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(slugify("Capital One"), "capital-one")
        self.assertEqual(slugify("  Stripe "), "stripe")
        self.assertEqual(slugify("AT&T Labs!"), "at-t-labs")


class ParseCompaniesTest(unittest.TestCase):
    def test_valid_entries(self):
        companies = parse_companies({"companies": [
            {"name": "Stripe", "ats": "greenhouse", "board": "stripe"},
            {"name": "Palantir", "ats": "lever", "site": "palantir"},
            {"name": "Ramp", "ats": "ashby", "board": "ramp"},
            {"name": "Capital One", "ats": "workday", "tenant": "capitalone", "wd": "wd12", "site": "Capital_One"},
        ]})
        self.assertEqual([c.name for c in companies], ["Stripe", "Palantir", "Ramp", "Capital One"])
        self.assertEqual(companies[3].slug, "capital-one")
        self.assertEqual(companies[3].options["tenant"], "capitalone")

    def test_explicit_slug(self):
        (company,) = parse_companies({"companies": [
            {"name": "Stripe", "slug": "stripe-inc", "ats": "greenhouse", "board": "stripe"},
        ]})
        self.assertEqual(company.slug, "stripe-inc")

    def test_options_are_read_only(self):
        (company,) = parse_companies({"companies": [{"name": "Ramp", "ats": "ashby", "board": "ramp"}]})
        with self.assertRaises(TypeError):
            company.options["board"] = "evil"  # type: ignore[index]

    def test_invalid_entries(self):
        bad = [
            {"companies": "nope"},
            [],
            {"companies": [{"ats": "greenhouse", "board": "stripe"}]},
            {"companies": [{"name": "Meta", "ats": None}]},
            {"companies": [{"name": "LinkedIn", "ats": "linkedin", "board": "x"}]},
            {"companies": [{"name": "Stripe", "ats": "greenhouse"}]},
            {"companies": [{"name": "Stripe", "ats": "greenhouse", "board": "stripe/../x"}]},
            {"companies": [{"name": "Stripe", "ats": "greenhouse", "board": "a?b=c"}]},
            {"companies": [{"name": "C1", "ats": "workday", "tenant": "capitalone", "wd": "linkedin", "site": "x"}]},
            {"companies": [{"name": "C1", "ats": "workday", "tenant": "evil.com#", "wd": "wd1", "site": "x"}]},
            {"companies": [
                {"name": "Stripe", "ats": "greenhouse", "board": "stripe"},
                {"name": "stripe", "ats": "greenhouse", "board": "stripe2"},
            ]},
            {"companies": [{"name": "Ramp", "ats": "ashby", "board": "ramp", "max_pages": 5}]},
        ]
        for data in bad:
            with self.subTest(data=data):
                with self.assertRaises(ConfigError):
                    parse_companies(data)

    def test_workday_numeric_options(self):
        (company,) = parse_companies({"companies": [{
            "name": "C1", "ats": "workday", "tenant": "capitalone", "wd": "wd12", "site": "Capital_One",
            "max_pages": 10, "max_details": 50,
        }]})
        self.assertEqual(company.options["max_pages"], 10)
        with self.assertRaises(ConfigError):
            parse_companies({"companies": [{
                "name": "C1", "ats": "workday", "tenant": "capitalone", "wd": "wd12", "site": "Capital_One",
                "max_pages": 0,
            }]})


class LoadCompaniesTest(unittest.TestCase):
    def test_missing_file(self):
        with self.assertRaises(ConfigError):
            load_companies("/nonexistent/companies.json")

    def test_invalid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "c.json"
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaises(ConfigError):
                load_companies(path)

    def test_shipped_companies_file(self):
        companies = load_companies(REPO_COMPANIES)
        by_name = {c.name: c for c in companies}
        self.assertEqual(
            set(by_name),
            {"Stripe", "Datadog", "Cloudflare", "Ramp", "Palantir", "Capital One"},
        )
        self.assertEqual(by_name["Ramp"].ats, "ashby")
        self.assertEqual(by_name["Palantir"].ats, "lever")
        self.assertEqual(by_name["Capital One"].ats, "workday")
        for name in ("Stripe", "Datadog", "Cloudflare"):
            self.assertEqual(by_name[name].ats, "greenhouse")
        for company in companies:
            with self.subTest(company=company.name):
                self.assertTrue(is_allowed_url(build_listing_url(company)))

    def test_shipped_file_is_plain_json(self):
        with open(REPO_COMPANIES, encoding="utf-8") as handle:
            data = json.load(handle)
        self.assertIn("companies", data)


if __name__ == "__main__":
    unittest.main()
