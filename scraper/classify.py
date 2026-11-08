"""Intern / new-grad detection from a posting's title, structured type and description.

``classify`` returns ``"intern"``, ``"newgrad"`` or ``None``. ``None`` means the role
is neither (or is clearly senior) and should be dropped by the caller.

Order of evidence, strongest first:
1. Strong seniority in the title (Senior, Staff, Principal, Director, ...) or a high-school program -> None.
2. Recruiting / program-staff roles about interns ("Intern Program Manager") -> None.
3. Title keywords: intern/internship/co-op -> intern; new grad/early career/... -> newgrad.
4. Weak seniority (Manager, Lead, Architect) without a title keyword -> None.
5. Structured employment type from the ATS ("Intern") -> intern.
6. Description phrases, unless the description asks for 3+ years of experience.
"""

from __future__ import annotations

import re
from typing import Literal

JobType = Literal["intern", "newgrad"]

_FLAGS = re.IGNORECASE

_STRONG_SENIORITY = re.compile(
    r"\b(senior|sr|staff|principal|director|head|vp|svp|evp|avp|vice president|chief|distinguished)\b", _FLAGS
)
_WEAK_SENIORITY = re.compile(r"\b(manager|lead|architect)\b", _FLAGS)
_KEYWORD = r"(interns?|internships?|co-?ops?|new[ -]?grad(?:uate)?s?|university|campus|early[ -]career)"
_PROGRAM_STAFF = re.compile(
    rf"\b{_KEYWORD}\s+(program(s)?\s+(manager|coordinator|lead|specialist|partner|director)|recruit\w*|hiring)\b",
    _FLAGS,
)
# Inroad is for college students: high-school programs are out of scope even when they are "internships".
_HIGH_SCHOOL = re.compile(r"\bhigh[ -]school\b", _FLAGS)
_INTERN_TITLE = re.compile(
    r"\b(interns?|internships?|co-?ops?|apprentices?|apprenticeships?|werkstudent)\b"
    r"|\bsummer\s+(analyst|associate|engineer|intern)\b",
    _FLAGS,
)
_NEWGRAD_TITLE = re.compile(
    r"\bnew[ -]?grad(uate)?s?\b"
    r"|\b(university|recent|college)\s+grad(uate)?s?\b"
    r"|\bearly[ -]career\b"
    r"|\bentry[ -]level\b"
    r"|\bgraduate\s+(program|scheme|engineer|software|developer|analyst|associate|scientist|trainee)\b"
    r"|\b20\d\d\s+grad(uate)?s?\b"
    r"|\bgrad(uate)?s?\s+20\d\d\b"
    r"|\bclass\s+of\s+20\d\d\b"
    r"|\bcampus\s+hire\b"
    r"|\b(development|rotational|leadership)\s+program\b(?!\s+(manager|coordinator|lead))",
    _FLAGS,
)
_INTERN_EMPLOYMENT = re.compile(r"\bintern(ship)?s?\b", _FLAGS)
_EXPERIENCE_VETO = re.compile(
    r"\b(?:[3-9]|[1-9]\d)\s*\+?\s*(?:(?:-|–|to)\s*\d+\s*\+?\s*)?years?\b[^.\n]{0,60}?\bexperience\b",
    _FLAGS,
)
_INTERN_DESCRIPTION = re.compile(
    r"\b(this|the)\s+(\d{1,2}[- ]week\s+)?((summer|fall|spring|winter)\s+)?internship\b"
    r"|\b\d{1,2}[- ]week\s+((summer|fall|spring|winter)\s+)?internship\b"
    r"|\bas\s+an\s+intern\b"
    r"|\bduring\s+your\s+internship\b",
    _FLAGS,
)
_NEWGRAD_DESCRIPTION = re.compile(
    r"\bnew[ -]?grad(uate)?s?\b"
    r"|\brecent\s+((college|university)\s+)?grad(uate)?s?\b"
    r"|\bgraduating\s+(in|by|between)\s+(20\d\d|spring|summer|fall|winter|december|may|june)\b"
    r"|\bclass\s+of\s+20\d\d\b"
    r"|\bearly[ -]career\s+(program|role|engineers?|candidates?)\b"
    r"|\b(university|college)\s+graduates?\b",
    _FLAGS,
)
_SOFT_CANDIDATE = re.compile(
    r"\b(associate|program|university|campus|graduate|grad|early career|entry|junior|jr|apprentice|trainee"
    r"|fellow|fellowship|analyst i|engineer i|level 1)\b",
    _FLAGS,
)


def _from_title(title: str) -> JobType | None:
    if _INTERN_TITLE.search(title):
        return "intern"
    if _NEWGRAD_TITLE.search(title):
        return "newgrad"
    return None


def _from_description(description: str) -> JobType | None:
    if not description or _EXPERIENCE_VETO.search(description):
        return None
    if _INTERN_DESCRIPTION.search(description):
        return "intern"
    if _NEWGRAD_DESCRIPTION.search(description):
        return "newgrad"
    return None


def classify(
    title: str | None,
    description: str | None = "",
    employment_type: str | None = None,
) -> JobType | None:
    """Return ``"intern"``, ``"newgrad"`` or ``None`` (neither / too senior)."""
    title = (title or "").strip()
    if not title or _STRONG_SENIORITY.search(title) or _PROGRAM_STAFF.search(title) or _HIGH_SCHOOL.search(title):
        return None
    from_title = _from_title(title)
    if from_title is not None:
        return from_title
    if _WEAK_SENIORITY.search(title):
        return None
    if employment_type and _INTERN_EMPLOYMENT.search(employment_type):
        return "intern"
    return _from_description(description or "")


# Inroad is for SWE internships and new-grad roles (brief, first line). These decide the discipline from the
# title, with the posting's department as a tie-breaker for neutral titles such as "Summer Intern 2027".
_SOFTWARE_STRONG = re.compile(
    r"\b(software|developers?|programmers?|swe|sde|full[ -]?stack|back[ -]?end|front[ -]?end|ios|android"
    r"|firmware|embedded|machine learning|site reliability|sre|devops)\b",
    _FLAGS,
)
_SOFTWARE_EXCLUDED = re.compile(
    r"\b(sales|marketing|recruit\w*|designers?|design|product manag\w*|program manag\w*|project manag\w*"
    r"|strateg\w*|analysts?|account\w*|controller\w*|finance|financial|legal|counsel|customer|support"
    r"|commercial|business|people|human resources|communications|policy|writer|editor|tax|audit"
    r"|procurement|representatives?|coordinators?)\b",
    _FLAGS,
)
_SOFTWARE_WEAK = re.compile(
    r"\b(engineer\w*|scien\w*|research\w*|ml|ai|security|infrastructure|technology)\b", _FLAGS
)
_ENGINEERING_DEPARTMENT = re.compile(
    r"\b(engineering|software|technology|research|r&d|data|machine learning|ai|security|infrastructure"
    r"|platform|development)\b",
    _FLAGS,
)


def is_software_role(title: str | None, department: str | None = None) -> bool:
    """True for software / ML / research engineering roles; False for sales, design, product, ops and the like."""
    title = (title or "").strip()
    if not title:
        return False
    if _SOFTWARE_STRONG.search(title):
        return True
    if _SOFTWARE_EXCLUDED.search(title):
        return False
    if _SOFTWARE_WEAK.search(title):
        return True
    return bool(department and _ENGINEERING_DEPARTMENT.search(department))


def might_be_early_career(title: str | None) -> bool:
    """Cheap title-only pre-filter used to decide which Workday details are worth fetching."""
    title = (title or "").strip()
    if not title:
        return False
    if classify(title) is not None:
        return True
    if _STRONG_SENIORITY.search(title) or _WEAK_SENIORITY.search(title):
        return False
    return _SOFT_CANDIDATE.search(title) is not None
