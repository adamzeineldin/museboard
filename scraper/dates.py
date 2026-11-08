"""Timestamp normalisation: every date leaves the scraper as UTC ``YYYY-MM-DDTHH:MM:SSZ``."""

from __future__ import annotations

import re
from datetime import datetime, timezone

_DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def format_utc(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_from_string(value: object) -> str | None:
    """Parse an ISO-8601 timestamp (offset, ``Z`` or naive=UTC); None if unparseable."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return format_utc(datetime.fromisoformat(text))
    except ValueError:
        return None


def iso_from_epoch_ms(value: object) -> str | None:
    """Lever's ``createdAt`` is epoch milliseconds."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return format_utc(datetime.fromtimestamp(value / 1000, tz=timezone.utc))
    except (OverflowError, OSError, ValueError):
        return None


def iso_from_date(value: object) -> str | None:
    """A bare ``YYYY-MM-DD`` (Workday ``startDate``) becomes midnight UTC."""
    if not isinstance(value, str) or not _DATE_ONLY_RE.match(value.strip()):
        return None
    return iso_from_string(value.strip() + "T00:00:00+00:00")


def utc_now_iso() -> str:
    return format_utc(datetime.now(timezone.utc))
