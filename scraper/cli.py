"""Command line entry point: ``python -m scraper --companies scraper/companies.json``.

Exit codes: 0 = at least one company scraped (or none configured), 1 = every company failed
(JSON is still written), 2 = usage or config error (nothing written).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Sequence

from .config import CompanyConfig, load_companies
from .errors import ConfigError
from .http import HttpClient
from .runner import DEFAULT_MAX_WORKERS, run_scrape

log = logging.getLogger("scraper")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m scraper", description="Scrape public ATS job boards.")
    parser.add_argument("--companies", required=True, help="path to companies.json")
    parser.add_argument("--out", default="-", help="output file, or - for stdout (default)")
    parser.add_argument("--company", help="only scrape this company (case-insensitive name)")
    parser.add_argument(
        "--include-all", action="store_true",
        help="also emit roles that are neither intern nor new grad (type null) and non-software roles",
    )
    parser.add_argument("--max-workers", type=int, default=DEFAULT_MAX_WORKERS, help="companies scraped in parallel")
    parser.add_argument("-v", "--verbose", action="store_true", help="log progress to stderr")
    return parser


def _select(companies: Sequence[CompanyConfig], name: str | None) -> tuple[CompanyConfig, ...]:
    if name is None:
        return tuple(companies)
    chosen = tuple(c for c in companies if c.name.lower() == name.strip().lower())
    if not chosen:
        raise ConfigError(f"company {name!r} is not in the config")
    return chosen


def _write(result: dict[str, Any], out: str) -> None:
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if out == "-":
        sys.stdout.write(text)
        sys.stdout.flush()
        return
    target = Path(out)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".scrape-", suffix=".json", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    if args.max_workers < 1:
        print("error: --max-workers must be >= 1", file=sys.stderr)
        return 2
    try:
        companies = _select(load_companies(args.companies), args.company)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    result = run_scrape(companies, HttpClient(), include_all=args.include_all, max_workers=args.max_workers)
    try:
        _write(result, args.out)
    except OSError as exc:
        print(f"error: cannot write output: {exc}", file=sys.stderr)
        return 2
    statuses = [company["ok"] for company in result["companies"]]
    return 1 if statuses and not any(statuses) else 0
