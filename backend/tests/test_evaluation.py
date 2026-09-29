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
    assert m["comparison"] == {"paired_n": 2, "baseline_hallucination_rate_pct": 50.0,
                               "guarded_hallucination_rate_pct": 0.0, "reduction_pts": 50.0,
                               "latency_cost_p50_ms": 2000}
    assert m["per_type"]["stale_trap"]["baseline"]["hallucination_rate_pct"] == 100.0
    assert m["questions"] == 2


STALE = {"BAG-007", "FEE-001", "PET-003", "SPA-003"}


def test_question_set_matches_the_brief() -> None:
    qs = load_questions()
    counts = {t: sum(q.type == t for q in qs) for t in
              ("answerable", "stale_trap", "adversarial", "out_of_scope")}
    assert len(qs) == 80
    assert counts == {"answerable": 35, "stale_trap": 15, "adversarial": 20, "out_of_scope": 10}
    for q in qs:
        if q.type == "out_of_scope":
            assert q.gold_fact_ids == [], q.id
        else:
            assert q.gold_fact_ids, q.id
        if q.type == "stale_trap":  # every stale trap targets one of the four planted facts
            assert STALE & set(q.gold_fact_ids), q.id
    assert {q.language for q in qs} == {"en", "hi", "te"}


def test_comparison_uses_only_questions_finished_in_both_modes() -> None:
    records = [
        rec("baseline", True, id_="E01"), rec("baseline", True, id_="E02"),
        rec("guarded", False, id_="E01"),  # E02 has no guarded result (skipped)
    ]
    comp = summarize(records)["comparison"]
    assert comp["paired_n"] == 1
    assert comp["baseline_hallucination_rate_pct"] == 100.0
    assert comp["guarded_hallucination_rate_pct"] == 0.0


def test_gemini_only_rejects_local_answers() -> None:
    import pytest

    from app.evaluation import Skip, require_gemini
    require_gemini({"gemini"}, True, "x")
    require_gemini({"ollama"}, False, "x")
    with pytest.raises(Skip):
        require_gemini({"gemini", "ollama"}, True, "The grade")


def test_grader_sees_same_topic_facts_for_non_english_answers() -> None:
    from app.evaluation import EvalQuestion, grading_facts
    q = EvalQuestion(id="E42", type="stale_trap", category="baggage", question="q", gold_fact_ids=["BAG-007"])
    hindi = {f.id for f in grading_facts(q, "घरेलू उड़ान में शुल्क ₹650 प्रति किलो है। कार्ड या यूपीआई से भुगतान।")}
    english = {f.id for f in grading_facts(q, "Excess baggage is ₹650 per kg.")}
    assert "BAG-015" in hindi  # card or UPI at the counter: same category as the gold fact
    assert "BAG-007" in english and len(english) < len(hindi)


def test_cached_replays_carry_the_last_live_latency() -> None:
    from app.evaluation import live_latencies, previous_live_ms
    runs = [
        [{"id": "E01", "mode": "guarded", "ms": 9000, "cached": False},
         {"id": "E02", "mode": "guarded", "ms": 40, "cached": True}],  # no live time known
        [{"id": "E01", "mode": "guarded", "ms": 30, "cached": True, "live_ms": 9000},
         {"id": "E02", "mode": "guarded", "ms": 7000, "cached": False}],
    ]
    assert previous_live_ms(runs) == {("E01", "guarded"): 9000, ("E02", "guarded"): 7000}
    now = [{"ms": 20, "cached": True, "live_ms": 9000}, {"ms": 25, "cached": True},
           {"ms": 5000, "cached": False}]
    assert live_latencies(now) == [9000, 5000]


def test_short_cooldowns_are_waited_out_long_ones_skipped() -> None:
    from app.evaluation import Skip, retry_wait, llm
    assert retry_wait(llm.LLMError("busy", kind="rate_limit", provider="gemini", retry_after_s=29)) == 31
    assert retry_wait(llm.LLMError("quota", kind="rate_limit", provider="gemini", retry_after_s=3600)) is None
    assert retry_wait(llm.LLMError("bad json", kind="invalid_output", provider="gemini")) is None
    assert retry_wait(Skip("All Gemini models are busy (all models cooling down). Retrying in 12 s.")) == 14
    assert retry_wait(Skip("The grade came from the local model, and this run is Gemini only.")) is None


def test_model_outage_is_skipped_not_scored(monkeypatch: Any) -> None:
    """An escalation caused by every model failing must not count as a caught hallucination."""
    import asyncio

    from app import evaluation
    from app.schemas import ChatResult

    async def outage(req: Any, **_: Any) -> Any:
        return ChatResult.model_construct(
            status="escalated", final_answer="hand-off", retries=0, trust_score=0,
            interaction_id=1, drafts=[], claims=[], timings={"total_ms": 5, "spans": []},
            error={"kind": "rate_limit", "message": "All Gemini models are busy.", "provider": "gemini"})

    async def no_baseline(q: Any, gemini_only: bool = False) -> Any:
        raise evaluation.llm.LLMError("quota", kind="rate_limit", provider="gemini")

    monkeypatch.setattr(evaluation, "run_chat", outage)
    monkeypatch.setattr(evaluation, "baseline_answer", no_baseline)
    monkeypatch.setattr(evaluation.db, "insert_eval_run", lambda mode, metrics, recs: 7)

    async def collect() -> list[tuple[str, Any]]:
        return [e async for e in evaluation.run_eval("all", question_ids=["E01"])]

    events = asyncio.run(collect())
    records = [d["record"] for e, d in events if e == "question"]
    assert [r["mode"] for r in records] == ["baseline", "guarded", "injected"]  # question-major
    assert all(r.get("skipped") for r in records)
    assert "busy" in records[1]["error"]
    done = events[-1][1]["metrics"]
    assert done["skipped"] == 3 and done["modes"] == {}
