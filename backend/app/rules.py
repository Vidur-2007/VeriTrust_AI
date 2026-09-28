"""Deterministic re-check of numbers in claims the Judge marked as supported.

Conservative on purpose: a claim is flipped to contradicted only when it states a quantity in a
unit class that a cited fact also uses, and that number appears nowhere in the cited facts
(value or statement), nowhere in the customer's question, and isn't a simple product of a fact
value (e.g. 3 kg x ₹650 = ₹1,950).
"""

import re
from dataclasses import dataclass

from app.db import Fact
from app.schemas import Claim

_DIGITS = str.maketrans("०१२३४५६७८९౦౧౨౩౪౫౬౭౮౯", "0123456789" * 2)
_NUM = r"\d[\d,]*(?:\.\d+)?"
NUMBER_RE = re.compile(_NUM)

# unit word -> unit class. Longest alternatives first so "working days" beats "days".
_UNIT_WORDS: dict[str, str] = {
    "working days": "days", "business days": "days", "days": "days", "day": "days",
    "tier miles": "miles", "miles": "miles",
    "kilograms": "kg", "kilogram": "kg", "kilos": "kg", "kgs": "kg", "kg": "kg",
    "hours": "hours", "hour": "hours", "hrs": "hours", "hr": "hours",
    "minutes": "minutes", "minute": "minutes", "mins": "minutes", "min": "minutes",
    "weeks": "weeks", "week": "weeks",
    "months": "months", "month": "months",
    "years": "years", "year": "years",
    "percent": "percent", "%": "percent",
    "rupees": "currency", "rupee": "currency", "inr": "currency",
    "cm": "cm",
}
_UNIT_ALT = "|".join(re.escape(u) for u in sorted(_UNIT_WORDS, key=len, reverse=True))
SUFFIX_RE = re.compile(rf"({_NUM})\s*(?:-\s*)?({_UNIT_ALT})(?![a-z])", re.IGNORECASE)
CURRENCY_PREFIX_RE = re.compile(rf"(?:₹|\brs\.?|\binr)\s*({_NUM})", re.IGNORECASE)

FACT_UNIT_CLASS: dict[str, str] = {
    "INR": "currency", "INR/kg": "currency", "kg": "kg", "cm": "cm", "hours": "hours",
    "minutes": "minutes", "days": "days", "working days": "days", "weeks": "weeks",
    "months": "months", "years": "years", "%": "percent", "Miles": "miles", "Tier Miles": "miles",
}


@dataclass(frozen=True)
class Quantity:
    value: float
    unit_class: str
    raw: str


def _to_float(s: str) -> float:
    return float(s.replace(",", ""))


def normalize(text: str) -> str:
    return text.translate(_DIGITS)


def numbers_in(text: str) -> set[float]:
    return {_to_float(m) for m in NUMBER_RE.findall(normalize(text))}


def extract_quantities(text: str) -> list[Quantity]:
    text = normalize(text)
    found: dict[tuple[float, str], Quantity] = {}
    for m in CURRENCY_PREFIX_RE.finditer(text):
        q = Quantity(_to_float(m.group(1)), "currency", m.group(0).strip())
        found[(q.value, q.unit_class)] = q
    for m in SUFFIX_RE.finditer(text):
        q = Quantity(_to_float(m.group(1)), _UNIT_WORDS[m.group(2).lower()], m.group(0).strip())
        found.setdefault((q.value, q.unit_class), q)
    return list(found.values())


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= 0.005 * max(1.0, abs(b))


def _fmt(fact: Fact) -> str:
    return f"₹{fact.value}" if fact.unit in ("INR", "INR/kg") else f"{fact.value} {fact.unit or ''}".strip()


def check_claim(claim: Claim, facts: dict[str, Fact], question: str) -> str | None:
    """Return a mismatch note, or None if the claim's numbers are consistent with its facts."""
    cited = [facts[i] for i in claim.evidence_fact_ids if i in facts]
    classes = {FACT_UNIT_CLASS.get(f.unit or "") for f in cited} - {None}
    if not classes:
        return None
    allowed: set[float] = set()
    for f in cited:
        allowed |= numbers_in(f.value) | numbers_in(f.statement)
    question_nums = numbers_in(question)
    multipliers = (numbers_in(claim.text_en) | numbers_in(claim.text) | question_nums) - {0.0, 1.0}

    for q in extract_quantities(claim.text_en) + extract_quantities(claim.text):
        if q.unit_class not in classes:
            continue
        if any(_close(q.value, v) for v in allowed | question_nums):
            continue
        if any(_close(q.value, v * n) for v in allowed for n in multipliers):
            continue
        fact = next(f for f in cited if FACT_UNIT_CLASS.get(f.unit or "") == q.unit_class)
        return f"Claim says {q.raw}; {fact.id} is {_fmt(fact)}"
    return None


def apply_rules(claims: list[Claim], facts: dict[str, Fact], question: str) -> list[Claim]:
    """Re-check supported claims. Flipped claims get caught_by="rules"; all others "judge"."""
    out: list[Claim] = []
    for c in claims:
        note = check_claim(c, facts, question) if c.verdict == "supported" else None
        if note:
            out.append(c.model_copy(update={
                "verdict": "contradicted", "caught_by": "rules", "rule_note": note,
                "correction": c.correction or note,
            }))
        else:
            out.append(c.model_copy(update={"caught_by": "judge"}))
    return out
