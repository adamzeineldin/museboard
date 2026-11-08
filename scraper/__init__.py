"""Inroad job scraper.

Reads public ATS job-board APIs (Greenhouse, Lever, Ashby, Workday) only and
emits intern / new-grad postings as JSON. Standard library only.

Run with ``python -m scraper --companies scraper/companies.json``.
"""

__version__ = "1.0.0"

import logging as _logging

# Library code logs; only the CLI decides where logs go.
_logging.getLogger(__name__).addHandler(_logging.NullHandler())
