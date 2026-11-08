"""Shared helpers for scraper tests: fixture loading and a fake HTTP client."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def load_fixture(name: str) -> Any:
    with open(FIXTURES_DIR / name, encoding="utf-8") as handle:
        return json.load(handle)


class FakeClient:
    """Stands in for scraper.http.HttpClient; records every call."""

    def __init__(
        self,
        get: Callable[[str], Any] | None = None,
        post: Callable[[str, Any], Any] | None = None,
    ) -> None:
        self._get = get
        self._post = post
        self.get_calls: list[str] = []
        self.post_calls: list[tuple[str, Any]] = []

    def get_json(self, url: str) -> Any:
        self.get_calls.append(url)
        if self._get is None:
            raise AssertionError(f"unexpected GET {url}")
        return self._get(url)

    def post_json(self, url: str, body: Any) -> Any:
        self.post_calls.append((url, body))
        if self._post is None:
            raise AssertionError(f"unexpected POST {url}")
        return self._post(url, body)
