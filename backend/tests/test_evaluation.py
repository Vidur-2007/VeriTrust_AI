import json
from typing import Any

from app.config import DATA_SOURCE_DIR
from app.evaluation import is_hallucination, load_questions, modes_for, summarize
from app.schemas import Claim

HIGH_RISK = ["fees", "refunds", "baggage"]


def c(verdict: str, category: str = "fees") -> Claim:
    return Claim(text="x", text_en="x", category=category, verdict=verdict)


def test_hallucination_rule() -> None:
    assert is_hallucination([c("contradicted", "loyalty")], HIGH_RISK)
    assert is_hallucination([c("unsupported", "fees")], HIGH_RISK)
    assert not is_hallucination([c("unsupported", "loyalty")], HIGH_RISK)
    assert not is_hallucination([c("supported")], HIGH_RISK)
    assert not is_hallucination([], HIGH_RISK)


def test_questions_file_is_valid() -> None:
    qs = load_questions()
    facts = {f["id"] for f in json.loads((DATA_SOURCE_DIR / "facts.json").read_text("utf-8"))}
    assert len(qs) >= 10 and len({q.id for q in qs}) == len(qs)
    assert {q.type for q in qs} == {"answerable", "stale_trap", "adversarial", "out_of_scope"}
    assert all(set(q.gold_fact_ids) <= facts for q in qs)
    assert [q.id for q in load_questions(limit=2)] == ["E01", "E02"]
    assert modes_for("all") == ["baseline", "guarded", "injected"]


def rec(mode: str, hallucinated: bool, *, type_: str = "answerable", status: str = "approved",
        blocked: bool = False, first_bad: bool | None = None, injected: str | None = None,
        ms: int = 1000, cat: str = "fees", id_: str = "E01") -> dict[str, Any]:
    r: dict[str, Any] = {"id": id_, "type": type_, "category": cat, "mode": mode,
                         "hallucinated": hallucinated, "status": status, "ms": ms,
                         "first_draft_blocked": blocked, "models": ["gemini"]}
    if first_bad is not None:
        r["first_draft_hallucinated"] = first_bad
    if injected is not None:
        r["injected_detail"] = injected
    return r


def test_summarize() -> None:
    records = [
        rec("baseline", True, type_="stale_trap", ms=1000, id_="E06"),
        rec("baseline", False, ms=1000),
        rec("guarded", False, type_="stale_trap", status="corrected", blocked=True,
            first_bad=True, ms=3000, id_="E06"),
        rec("guarded", False, status="corrected", blocked=True, first_bad=False, ms=3000),
        rec("injected", False, status="corrected", blocked=True, injected="10 days"),
        rec("injected", False, status="approved", blocked=False, injected="9 days"),
        rec("injected", False, status="approved", blocked=False, injected=None),
    ]
    m = summarize(records)
    assert m["modes"]["baseline"]["hallucination_rate_pct"] == 50.0
    assert m["modes"]["guarded"]["hallucination_rate_pct"] == 0.0
    assert m["modes"]["guarded"]["false_block_rate_pct"] == 100.0  # 1 answerable, clean, blocked
    assert m["modes"]["guarded"]["correction_success_pct"] == 100.0
    assert m["modes"]["injected"]["catch_rate_pct"] == 50.0
    assert m["modes"]["injected"]["maker_skipped_injection"] == 1
    assert m["comparison"] == {"baseline_hallucination_rate_pct": 50.0,
                               "guarded_hallucination_rate_pct": 0.0, "reduction_pts": 50.0,
                               "latency_cost_p50_ms": 2000}
    assert m["per_type"]["stale_trap"]["baseline"]["hallucination_rate_pct"] == 100.0
    assert m["questions"] == 2
