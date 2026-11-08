"""Host allow-list: the scraper may only talk to public ATS job-board APIs.

Anything else (LinkedIn, Instagram, Meta Careers, Google Careers, any social
site, arbitrary hosts) is rejected before a socket is opened.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from .errors import DisallowedHostError

ALLOWED_EXACT_HOSTS = frozenset({
    "boards-api.greenhouse.io",
    "api.lever.co",
    "api.eu.lever.co",
    "api.ashbyhq.com",
})

# Workday tenants live on <tenant>.wd<N>.myworkdayjobs.com.
WORKDAY_HOST_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}\.wd\d{1,3}\.myworkdayjobs\.com$")


def _host_is_allowed(host: str) -> bool:
    return host in ALLOWED_EXACT_HOSTS or WORKDAY_HOST_RE.fullmatch(host) is not None


def is_allowed_url(url: str) -> bool:
    """True only for https URLs on an allowed ATS API host, default port, no userinfo."""
    if not isinstance(url, str) or not url:
        return False
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    if parts.scheme != "https" or port not in (None, 443):
        return False
    if parts.username is not None or parts.password is not None:
        return False
    host = (parts.hostname or "").lower()
    return bool(host) and _host_is_allowed(host)


def ensure_allowed_url(url: str) -> None:
    """Raise DisallowedHostError unless ``url`` passes :func:`is_allowed_url`."""
    if not is_allowed_url(url):
        raise DisallowedHostError(f"refusing to request non-ATS URL: {url!r}")
