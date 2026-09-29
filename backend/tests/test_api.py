"""Every Phase 3 endpoint through FastAPI's TestClient, on a temp DB, with no LLM calls."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import db, facts_service, redteam
from app.config import DATA_SOURCE_DIR, get_settings
from app.main import app
from app.schemas import ChatResult


def add_row(status: str = "approved", retries: int = 0, channel: str = "console",
            review_status: str = "none", injected: bool = False,
            question: str = "How much cabin baggage?") -> int:
    claims = [{"text": "7 kg", "text_en": "7 kg", "category": "baggage", "verdict": "supported",
               "evidence_fact_ids": ["BAG-001"], "caught_by": "judge",
               "evidence": [{"fact_id": "BAG-001", "statement": "Cabin bags up to 7 kg."}]}]
    return db.insert_interaction({
        "channel": channel, "question": question, "language": "en", "injected": int(injected),
        "attack_id": None, "input_flags": [],
        "drafts": [{"retry": 0, "text": "You can carry 7 kg.", "claims": claims}],
        "final_answer": "You can carry 7 kg.", "status": status, "claims": claims,
        "trust_score": 0 if status == "escalated" else 100 - 10 * retries, "retries": retries,
        "timings": {"total_ms": 1200, "nodes": {"maker": 500, "judge": 700}, "spans": []},
        "review_status": review_status, "strictness": "balanced"})


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(get_settings(), "data_dir", tmp_path)
    db.init_db()
    facts = json.loads((DATA_SOURCE_DIR / "facts.json").read_text(encoding="utf-8"))
    db.upsert_facts([db.Fact(**f) for f in facts])

    async def reembed(_: db.Fact) -> bool:
        return True

    monkeypatch.setattr(facts_service, "reembed", reembed)
    with TestClient(app) as c:
        yield c


def sse_events(text: str) -> list[tuple[str, Any]]:
    out = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def test_metrics_exclude_eval_by_default(client: TestClient) -> None:
    add_row()
    add_row("corrected", 1, injected=True)
    add_row(channel="eval")
    m = client.get("/api/metrics").json()
    assert m["total"] == 2 and m["blocked_rate_pct"] == 50.0 and len(m["timeseries"]) == 60
    assert m["injected"]["catch_rate_pct"] == 100.0
    assert client.get("/api/metrics?channels=eval").json()["total"] == 1
    assert client.get("/api/metrics?window_min=0").status_code == 422


def test_interactions_list_detail_report(client: TestClient) -> None:
    first = add_row()
    add_row("escalated", 2, review_status="pending", question="Refund please")
    page = client.get("/api/interactions?limit=1").json()
    assert page["total"] == 2 and len(page["items"]) == 1 and page["items"][0]["id"] == first + 1
    assert client.get("/api/interactions?q=Refund").json()["total"] == 1
    assert client.get("/api/interactions?status=nope").status_code == 422
    assert client.get(f"/api/interactions/{first}").json()["drafts"][0]["text"]
    assert client.get("/api/interactions/999").status_code == 404
    rep = client.get(f"/api/interactions/{first}/report").json()
    ev = rep["drafts"][0]["claims"][0]["evidence"][0]
    assert ev["fact_id"] == "BAG-001" and ev["current_value"] == "7"
    assert rep["trust"]["score"] == 100 and rep["decision"]["strictness"] == "balanced"


def test_facts_patch_and_drift(client: TestClient) -> None:
    assert client.get("/api/facts?category=pets").json()["count"] >= 6
    r = client.patch("/api/facts/BAG-007", json={"value": "700"})
    assert r.status_code == 200 and "₹700" in r.json()["fact"]["statement"]
    facts = {f["id"]: f for f in client.get("/api/facts").json()["items"]}
    assert facts["BAG-007"]["recently_changed"] and not facts["BAG-001"]["recently_changed"]
    drift = client.get("/api/drift/events").json()
    assert drift["items"][0]["fact_id"] == "BAG-007" and drift["items"][0]["subject"]
    assert client.patch("/api/facts/BAG-007", json={}).status_code == 422
    assert client.patch("/api/facts/NOPE-1", json={"value": "1"}).status_code == 404
    assert client.patch("/api/facts/PET-001", json={"value": "all"}).status_code == 422


def test_settings(client: TestClient) -> None:
    assert client.get("/api/settings").json()["strictness"] == "balanced"
    s = client.put("/api/settings", json={"strictness": "strict", "max_retries": 1}).json()
    assert s["strictness"] == "strict" and s["max_retries"] == 1
    for bad in ({"strictness": "chill"}, {"max_retries": 9}, {"high_risk_categories": ["x"]},
                {"unknown": 1}):
        assert client.put("/api/settings", json=bad).status_code == 422


def test_alerts(client: TestClient) -> None:
    add_row()
    assert not client.get("/api/alerts").json()["active"]
    add_row("corrected", 1)
    add_row("escalated", 2)
    a = client.get("/api/alerts").json()
    assert a["active"] and a["blocked"] == 2 and len(a["recent_failing"]) == 2


def test_exports(client: TestClient) -> None:
    add_row()
    add_row(channel="eval")
    csv_text = client.get("/api/export/interactions.csv").text
    lines = csv_text.strip().splitlines()
    assert lines[0].startswith("id,ts,channel,status") and len(lines) == 3
    assert client.get("/api/export/interactions.json?channel=eval").json()["count"] == 1


def test_review_queue(client: TestClient) -> None:
    add_row()
    pending = add_row("escalated", 2, review_status="pending")
    q = client.get("/api/review").json()
    assert q["count"] == 1 and q["items"][0]["id"] == pending
    assert client.post(f"/api/review/{pending}", json={"action": "edit"}).status_code == 422
    r = client.post(f"/api/review/{pending}", json={
        "action": "edit", "text": "Call me on 9876543210? Cabin bags are 7 kg.",
        "save_as_fact": {"category": "baggage", "subject": "pram", "attribute": "fee",
                         "value": "0", "unit": "INR", "statement": "Prams travel free."}}).json()
    assert r["review_status"] == "resolved" and "[PHONE]" in r["reviewer_text"]
    assert r["fact"]["fact"]["id"].startswith("BAG-") and r["pending"] == 0
    assert client.get("/api/review").json()["count"] == 0
    assert client.post(f"/api/review/{pending}", json={"action": "approve"}).status_code == 409
    assert client.post("/api/review/999", json={"action": "approve"}).status_code == 404


def test_redteam(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert client.get("/api/redteam/attacks").json()["count"] >= 20

    async def fake_run_chat(req: Any, request_id: Any = None, *, batch: bool = False) -> ChatResult:
        assert batch and req.channel == "redteam"
        return ChatResult(interaction_id=1, request_id="r", status="corrected",
                          final_answer="ok", language="en", claims=[], drafts=[], retries=1,
                          trust_score=90, trust_breakdown={}, input_flags=["prompt_injection"],
                          strictness="strict", timings={"total_ms": 5}, provider={},
                          pii_redacted=False)

    monkeypatch.setattr(redteam, "run_chat", fake_run_chat)
    r = client.post("/api/redteam/run", json={"attack_ids": ["ATK-01", "ATK-10"]})
    events = sse_events(r.text)
    assert [e for e, _ in events] == ["start", "attack_start", "attack_result", "attack_start",
                                      "attack_result", "done"]
    board = events[-1][1]["scoreboard"]
    assert board["totals"]["corrected"] == 2 and board["caught"] == 2 and board["flagged"] == 2
    assert client.post("/api/redteam/run", json={"attack_ids": ["NOPE"]}).status_code == 400


def test_audit_latest_empty(client: TestClient) -> None:
    assert client.get("/api/audit/latest").json() is None


def test_eval_latest_and_validation(client: TestClient) -> None:
    assert client.get("/api/eval/latest").json()["latest"] is None
    assert client.post("/api/eval/run", json={"mode": "nope"}).status_code == 422
    assert client.post("/api/eval/run", json={"question_ids": ["NOPE"]}).status_code == 400
