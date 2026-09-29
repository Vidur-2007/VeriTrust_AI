"""Manual audit: scan each support manual against the verified facts and list stale sections.

One LLM call per manual. The facts shown for a manual are the nearest facts to each of its
sections, found with the section vectors Chroma already stores (no extra embedding calls).
Every finding is checked by the server: the quote must really be in the manual, the fact must
exist, and if the quote's numbers match the fact it is dropped as a false positive.
"""

import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app import db, llm, retrieval, rules
from app.db import Fact
from app.manuals import chunk_manual, manual_paths
from app.spans import locate

FACTS_PER_SECTION = 8

AUDIT_SYSTEM = """You audit an airline's internal customer-support manual against VERIFIED \
FACTS from the company database. The verified facts are the source of truth; the manual may be \
out of date.

Find statements in the manual that CONTRADICT a verified fact: a different fee, amount, limit, \
deadline, age or rule about the same thing. Ignore details the facts simply don't mention.

For each contradiction return:
- "section": the ## heading it is under
- "quote": the exact sentence or bullet from the manual, copied character for character
- "fact_id": the ID of the verified fact it contradicts
- "issue": one sentence, e.g. "Manual says ₹550 per kg; verified fact says ₹650 per kg."
- "proposed_paragraph": the whole paragraph or list rewritten with the verified value, in the \
manual's style

If nothing contradicts the facts, return {"findings": []}."""


class AuditFinding(BaseModel):
    section: str
    quote: str
    fact_id: str
    issue: str
    proposed_paragraph: str


class AuditOut(BaseModel):
    findings: list[AuditFinding] = Field(default_factory=list)


def facts_for_manual(manual: str) -> list[Fact]:
    chunks = retrieval.get_collection("manual_chunks").get(
        where={"manual": manual}, include=["embeddings"])
    facts_col = retrieval.get_collection("facts")
    ids: list[str] = []
    for vector in chunks["embeddings"] if chunks["embeddings"] is not None else []:
        r = facts_col.query(query_embeddings=[list(vector)], n_results=FACTS_PER_SECTION,
                            include=[])
        ids += r["ids"][0]
    return [f for i in dict.fromkeys(ids) if (f := db.get_fact(i)) is not None]


def numeric_check(quote: str, fact: Fact) -> str:
    """mismatch: the quote states a number the fact doesn't; match: its numbers agree;
    n/a: no comparable numbers (a rule wording difference, judged by the LLM alone)."""
    unit_class = rules.FACT_UNIT_CLASS.get(fact.unit or "")
    quantities = [q for q in rules.extract_quantities(quote) if q.unit_class == unit_class]
    allowed = rules.numbers_in(fact.value) | rules.numbers_in(fact.statement)
    if not quantities or not allowed:
        return "n/a"
    return "match" if all(q.value in allowed for q in quantities) else "mismatch"


def validate_finding(f: AuditFinding, manual: str, text: str) -> dict[str, Any] | None:
    """`span` indexes the manual with whitespace collapsed: sentences wrap across lines in the
    markdown, and the model quotes them on one line."""
    fact = db.get_fact(f.fact_id)
    text = " ".join(text.split())
    start, end = locate(text, " ".join(f.quote.split()))
    if fact is None or start is None:
        return None
    check = numeric_check(f.quote, fact)
    if check == "match":
        return None
    return {
        "manual": manual, "section": f.section, "quote": text[start:end],
        "span": [start, end], "fact_id": fact.id, "verified_value": fact.value,
        "verified_unit": fact.unit, "verified_statement": fact.statement, "issue": f.issue,
        "proposed_paragraph": f.proposed_paragraph, "numeric_check": check,
    }


def _prompt(path: Path, facts: list[Fact]) -> str:
    fact_lines = "\n".join(f"[{f.id}] {f.statement}" for f in facts)
    return f"VERIFIED FACTS:\n{fact_lines}\n\nMANUAL ({path.name}):\n{path.read_text('utf-8')}"


async def run_audit() -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Yields ("progress" | "finding" | "error" | "result", data). Stores the audit at the end."""
    paths = manual_paths()
    findings: list[dict[str, Any]] = []
    started = time.perf_counter()
    for i, path in enumerate(paths):
        yield "progress", {"manual": path.name, "done": i, "total": len(paths)}
        text = path.read_text(encoding="utf-8")
        try:
            r = await llm.generate_json_result(
                _prompt(path, facts_for_manual(path.name)), AuditOut, system=AUDIT_SYSTEM,
                temperature=0.0, allow_long_wait=True)
        except llm.LLMError as e:
            yield "error", {"manual": path.name, "message": e.message}
            continue
        for f in r.data.findings:
            if (checked := validate_finding(f, path.name, text)) is not None:
                checked["model"] = r.model
                findings.append(checked)
                yield "finding", checked
    audit = db.insert_audit(findings)
    yield "result", {"audit_id": audit["id"], "ts": audit["ts"], "count": len(findings),
                     "manuals": len(paths), "sections": sum(len(chunk_manual(p)) for p in paths),
                     "ms": round((time.perf_counter() - started) * 1000), "findings": findings}
