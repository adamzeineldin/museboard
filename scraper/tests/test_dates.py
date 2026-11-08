import unittest

from scraper.dates import iso_from_date, iso_from_epoch_ms, iso_from_string


class DatesTest(unittest.TestCase):
    def test_offset_timestamp_is_normalised_to_utc(self):
        self.assertEqual(iso_from_string("2026-10-01T11:05:36-04:00"), "2026-10-01T15:05:36Z")

    def test_fractional_seconds_are_dropped(self):
        self.assertEqual(iso_from_string("2026-04-09T01:01:29.953+00:00"), "2026-04-09T01:01:29Z")

    def test_z_suffix_is_accepted(self):
        self.assertEqual(iso_from_string("2026-04-09T01:01:29Z"), "2026-04-09T01:01:29Z")

    def test_naive_timestamp_is_treated_as_utc(self):
        self.assertEqual(iso_from_string("2026-04-09T01:01:29"), "2026-04-09T01:01:29Z")

    def test_invalid_strings_return_none(self):
        for value in (None, "", "Posted Yesterday", 42):
            self.assertIsNone(iso_from_string(value))

    def test_epoch_ms(self):
        self.assertEqual(iso_from_epoch_ms(1778517108152), "2026-05-11T16:31:48Z")
        self.assertIsNone(iso_from_epoch_ms(None))
        self.assertIsNone(iso_from_epoch_ms("soon"))
        self.assertIsNone(iso_from_epoch_ms(True))

    def test_date_only(self):
        self.assertEqual(iso_from_date("2026-11-05"), "2026-11-05T00:00:00Z")
        self.assertIsNone(iso_from_date("11/05/2026"))
        self.assertIsNone(iso_from_date(None))


if __name__ == "__main__":
    unittest.main()
