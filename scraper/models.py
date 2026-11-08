"""Immutable output records. ``Job.to_dict`` / ``CompanyResult.to_dict`` define the JSON contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ATS_NAMES = ("greenhouse", "lever", "ashby", "workday")
JOB_TYPES = ("intern", "newgrad")
JOB_FIELDS = (
    "id", "company", "ats", "title", "location", "type", "posted_at", "url",
    "source", "description_text", "compensation", "department",
)


def make_job_id(ats: str, company_slug: str, posting_id: object) -> str:
    """Stable id ``<ats>:<companySlug>:<postingId>``; same posting -> same id on every run."""
    if posting_id is None or isinstance(posting_id, bool):
        raise ValueError("posting id is required")
    posting = str(posting_id).strip()
    if not ats or not company_slug or not posting:
        raise ValueError(f"cannot build job id from {ats!r}, {company_slug!r}, {posting_id!r}")
    return f"{ats}:{company_slug}:{posting}"


@dataclass(frozen=True)
class Job:
    id: str
    company: str
    ats: str
    title: str
    location: str | None
    type: str | None
    posted_at: str | None
    url: str
    source: str
    description_text: str
    compensation: str | None
    department: str | None

    def __post_init__(self) -> None:
        if self.ats not in ATS_NAMES:
            raise ValueError(f"unknown ats {self.ats!r}")
        if self.type is not None and self.type not in JOB_TYPES:
            raise ValueError(f"invalid job type {self.type!r}")
        if not self.id or not self.title or not self.company:
            raise ValueError("job id, title and company are required")
        if not isinstance(self.url, str) or not self.url.startswith(("https://", "http://")):
            raise ValueError(f"job url must be http(s): {self.url!r}")

    def to_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in JOB_FIELDS}


@dataclass(frozen=True)
class CompanyResult:
    company: str
    ats: str
    ok: bool
    error: str | None
    jobs: tuple[Job, ...] = field(default_factory=tuple)

    @classmethod
    def failure(cls, company: str, ats: str, error: str) -> "CompanyResult":
        return cls(company=company, ats=ats, ok=False, error=error, jobs=())

    def to_dict(self) -> dict[str, Any]:
        return {
            "company": self.company,
            "ats": self.ats,
            "ok": self.ok,
            "error": self.error,
            "jobs": [job.to_dict() for job in self.jobs],
        }
