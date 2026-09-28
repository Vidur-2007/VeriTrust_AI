"""Mask phone numbers, emails and PNR-like booking codes before anything is logged."""

import re

from pydantic import BaseModel

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
# Indian mobiles: optional +91 / 91 / 0 prefix, 10 digits starting 6-9, spaces or dashes allowed.
PHONE_RE = re.compile(r"(?<![\d₹])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")
# PNRs: 6 uppercase alphanumerics with at least one letter AND one digit, so "REFUND" survives.
PNR_RE = re.compile(r"\b(?=[A-Z0-9]{6}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{6}\b")

PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("EMAIL", EMAIL_RE),
    ("PHONE", PHONE_RE),
    ("PNR", PNR_RE),
)


class Redacted(BaseModel):
    text: str
    counts: dict[str, int]

    @property
    def redacted(self) -> bool:
        return any(self.counts.values())


def redact(text: str) -> Redacted:
    counts: dict[str, int] = {}
    for label, pattern in PATTERNS:
        text, n = pattern.subn(f"[{label}]", text)
        counts[label] = n
    return Redacted(text=text, counts=counts)
