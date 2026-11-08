"""HTML-to-text conversion and truncation for job descriptions."""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser

MAX_DESCRIPTION_CHARS = 8000
ELLIPSIS = "…"

_BLOCK_TAGS = frozenset({
    "p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
    "tr", "table", "section", "article", "header", "footer", "blockquote", "pre", "hr",
})
_SKIP_TAGS = frozenset({"script", "style", "noscript", "template"})


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ANN001 - stdlib signature
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        elif tag in _BLOCK_TAGS:
            self._chunks.append("\n")

    def handle_startendtag(self, tag: str, attrs) -> None:  # noqa: ANN001
        if tag in _BLOCK_TAGS:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag in _BLOCK_TAGS:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self._chunks.append(data)

    def text(self) -> str:
        return "".join(self._chunks)


def normalise_whitespace(text: str) -> str:
    text = text.replace(" ", " ").replace("\r", "\n")
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in text.split("\n")]
    joined = "\n".join(lines)
    return re.sub(r"\n{2,}", "\n", joined).strip()


def truncate(text: str, max_chars: int = MAX_DESCRIPTION_CHARS) -> str:
    """Cut ``text`` to at most ``max_chars`` characters, preferring a word boundary."""
    if len(text) <= max_chars:
        return text
    budget = max_chars - len(ELLIPSIS)
    cut = text[:budget]
    space = cut.rfind(" ")
    if space > budget // 2:
        cut = cut[:space]
    return cut.rstrip() + ELLIPSIS


def strip_html(markup: str | None, max_chars: int = MAX_DESCRIPTION_CHARS) -> str:
    """Return readable plain text from an HTML fragment, truncated to ``max_chars``."""
    if not markup or not isinstance(markup, str):
        return ""
    parser = _TextExtractor()
    try:
        parser.feed(markup)
        parser.close()
        raw = parser.text()
    except Exception:  # HTMLParser is lenient; this is a last-resort fallback.
        raw = html.unescape(re.sub(r"<[^>]*>", " ", markup))
    return truncate(normalise_whitespace(raw), max_chars)


def clean_plain_text(text: str | None, max_chars: int = MAX_DESCRIPTION_CHARS) -> str:
    """Normalise and truncate text that is already plain (no markup)."""
    if not text or not isinstance(text, str):
        return ""
    return truncate(normalise_whitespace(text), max_chars)


def strip_escaped_html(markup: str | None, max_chars: int = MAX_DESCRIPTION_CHARS) -> str:
    """Greenhouse returns entity-escaped HTML (``&lt;p&gt;``); unescape once, then strip."""
    if not markup or not isinstance(markup, str):
        return ""
    return strip_html(html.unescape(markup), max_chars)
