import unittest

from scraper.classify import classify, is_software_role, might_be_early_career


class ClassifyTitleTest(unittest.TestCase):
    INTERN_TITLES = [
        "Software Engineering Intern, Backend",
        "Data Analyst, Intern",
        "Deployment Strategist, Internship",
        "Intern, Strategy Analyst - Summer 2027",
        "Software Engineer Co-op (Fall 2027)",
        "Master's Machine Learning Engineer, Intern",
        "PhD Research Interns",
        "Product Manager Intern (2027) - Austin, TX",
    ]
    NEWGRAD_TITLES = [
        "Software Engineer, New Grad",
        "Associate, Strategy Analyst - New Grad 2027",
        "University Grad | Customer Experience Associate",
        "Software Engineer, Early Career — Immediate Start",
        "Sales Development Representative - Summer 2027 Graduates (Boston)",
        "Entry-Level Software Engineer",
        "Graduate Software Engineer",
        "Technology Development Program - Software Engineer",
        "New Graduate Engineer",
        "Product Manager: New Grad Accelerator",
        "Early Career Program - Software Engineer",
    ]
    NEITHER_TITLES = [
        "Abuse Investigator",
        "Growth Creative Designer, International",
        "Internal Tools Engineer",
        "Senior Software Engineer",
        "Senior Manager, Intern Programs",
        "Director, University Recruiting",
        "Staff Engineer, New Grad Hiring Platform",
        "Administrative Business Partner",
        "Intern Program Manager",
        "University Recruiter",
        "Campus Recruiting Partner",
        "Business Development Program Manager",
        "High School Internship, Software Engineering (Summer 2027)",
        "",
    ]

    def test_intern_titles(self):
        for title in self.INTERN_TITLES:
            with self.subTest(title=title):
                self.assertEqual(classify(title), "intern")

    def test_newgrad_titles(self):
        for title in self.NEWGRAD_TITLES:
            with self.subTest(title=title):
                self.assertEqual(classify(title), "newgrad")

    def test_neither(self):
        for title in self.NEITHER_TITLES:
            with self.subTest(title=title):
                self.assertIsNone(classify(title))

    def test_intern_wins_when_title_mentions_both(self):
        self.assertEqual(classify("New Grad & Intern Software Engineer"), "intern")


class ClassifyDescriptionTest(unittest.TestCase):
    def test_description_signal_for_neutral_title(self):
        desc = "This is a 12-week summer internship on the payments team."
        self.assertEqual(classify("Software Engineer", desc), "intern")

    def test_newgrad_description_signal(self):
        desc = "We are hiring recent graduates who are graduating in 2027 or earlier."
        self.assertEqual(classify("Software Engineer", desc), "newgrad")

    def test_experience_requirement_vetoes_description_signal(self):
        desc = "Mentor our summer internship cohort. Requires 5+ years of experience."
        self.assertIsNone(classify("Software Engineer", desc))

    def test_boilerplate_mentioning_international_is_ignored(self):
        desc = "We operate internationally and value internal mobility."
        self.assertIsNone(classify("Software Engineer", desc))

    def test_seniority_in_title_vetoes_description(self):
        desc = "You will run our summer internship program."
        self.assertIsNone(classify("Senior Program Manager", desc))

    def test_description_is_not_needed(self):
        self.assertIsNone(classify("Software Engineer", None))


class ClassifyEmploymentTypeTest(unittest.TestCase):
    def test_structured_intern_type(self):
        for value in ("Intern", "Internship", "intern"):
            with self.subTest(value=value):
                self.assertEqual(classify("Software Engineer", "", value), "intern")

    def test_full_time_type_does_not_classify(self):
        self.assertIsNone(classify("Software Engineer", "", "FullTime"))

    def test_seniority_vetoes_structured_type(self):
        self.assertIsNone(classify("Senior Software Engineer", "", "Intern"))


class MightBeEarlyCareerTest(unittest.TestCase):
    def test_candidates(self):
        for title in (
            "Intern, Strategy Analyst - Summer 2027",
            "Associate, Strategy Analyst - New Grad 2027",
            "Associate, Software Engineer",
            "Technology Development Program",
            "Campus Software Engineer",
        ):
            with self.subTest(title=title):
                self.assertTrue(might_be_early_career(title))

    def test_non_candidates(self):
        for title in (
            "Senior Associate, Product Manager-Small Business Bank Associate Servicing",
            "Principal Associate, Design Operations",
            "Director, Risk Management",
            "Full Stack Engineer 4",
            "Manager, Data Science - Model Risk Office",
        ):
            with self.subTest(title=title):
                self.assertFalse(might_be_early_career(title))


class SoftwareRoleTest(unittest.TestCase):
    """Inroad is for SWE internships and new-grad roles: early-career but non-engineering roles are dropped."""

    SOFTWARE = [
        "Software Engineering Intern, Backend",
        "Software Engineer, New Grad",
        "Forward Deployed Software Engineer, Internship - US Government",
        "Year at Palantir - Forward Deployed Software Engineer, Internship - Commercial",
        "Master's Machine Learning Engineer, Intern",
        "Applied Scientist Intern",
        "Research Science Intern (PhD)",
        "Current PhD, AI Engineering Internship Program - Summer 2027",
        "Technology Development Program - Software Engineer",
        "New Graduate Engineer",
        "Software Engineering Intern, iOS",
        "Full-Stack Developer Co-op",
        "Security Operations Engineer, New Grad",
        "Data Engineer, Early Career",
        "Site Reliability Engineer Intern",
    ]
    NOT_SOFTWARE = [
        "Sales Development Representative - Summer 2027 Graduates (Boston)",
        "Deployment Strategist, Internship",
        "Intern, Strategy Analyst - Summer 2027",
        "Product Designer, Internship",
        "Product Design Intern",
        "Product Manager: New Grad Accelerator",
        "Operations Associate, Apprenticeship",
        "Controllership Intern",
        "University Grad | Customer Experience Associate",
        "Junior Commercial Associate, Works in Progress",
        "Data Analyst, Intern",
        "Sales Engineer, New Grad",
        "Recruiting Coordinator Intern",
        "Marketing Intern",
        "",
    ]

    def test_software_roles(self):
        for title in self.SOFTWARE:
            with self.subTest(title=title):
                self.assertTrue(is_software_role(title))

    def test_other_roles(self):
        for title in self.NOT_SOFTWARE:
            with self.subTest(title=title):
                self.assertFalse(is_software_role(title))

    def test_engineering_department_rescues_a_neutral_title(self):
        self.assertTrue(is_software_role("Summer Intern 2027", "Engineering"))
        self.assertTrue(is_software_role("PhD Research Intern", "Research & Development"))
        self.assertFalse(is_software_role("Summer Intern 2027", "Finance"))
        self.assertFalse(is_software_role("Summer Intern 2027", None))

    def test_department_does_not_rescue_a_non_engineering_title(self):
        self.assertFalse(is_software_role("Sales Development Representative Intern", "Engineering"))
        self.assertFalse(is_software_role("Product Designer, Internship", "Engineering"))


if __name__ == "__main__":
    unittest.main()
