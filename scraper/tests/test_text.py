import unittest

from scraper.text import MAX_DESCRIPTION_CHARS, strip_html, truncate


class StripHtmlTest(unittest.TestCase):
    def test_removes_tags_and_decodes_entities(self):
        self.assertEqual(strip_html("<p>Hello &amp; <b>welcome</b></p>"), "Hello & welcome")

    def test_block_tags_become_line_breaks(self):
        text = strip_html("<h2>About</h2><p>One</p><ul><li>a</li><li>b</li></ul>")
        self.assertEqual(text, "About\nOne\na\nb")

    def test_drops_script_and_style_content(self):
        text = strip_html("<style>p{color:red}</style><p>Kept</p><script>alert(1)</script>")
        self.assertEqual(text, "Kept")

    def test_collapses_whitespace_and_nbsp(self):
        self.assertEqual(strip_html("<div>a&nbsp;&nbsp;  b\n\n\n\n c</div>"), "a b\nc")

    def test_empty_and_none(self):
        self.assertEqual(strip_html(""), "")
        self.assertEqual(strip_html(None), "")

    def test_plain_text_passes_through(self):
        self.assertEqual(strip_html("No markup here"), "No markup here")

    def test_unclosed_and_malformed_markup_does_not_raise(self):
        self.assertEqual(strip_html("<p>open <b>bold <i>x"), "open bold x")

    def test_long_text_is_truncated(self):
        text = strip_html("<p>" + ("word " * 5000) + "</p>")
        self.assertLessEqual(len(text), MAX_DESCRIPTION_CHARS)
        self.assertTrue(text.endswith("…"))


class TruncateTest(unittest.TestCase):
    def test_short_text_unchanged(self):
        self.assertEqual(truncate("abc", 10), "abc")

    def test_cuts_on_word_boundary_with_ellipsis(self):
        self.assertEqual(truncate("alpha beta gamma", 12), "alpha beta…")

    def test_hard_cut_when_no_space(self):
        result = truncate("x" * 50, 10)
        self.assertEqual(len(result), 10)
        self.assertTrue(result.endswith("…"))

    def test_default_limit_is_about_8k(self):
        self.assertEqual(MAX_DESCRIPTION_CHARS, 8000)


if __name__ == "__main__":
    unittest.main()
