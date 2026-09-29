from datetime import datetime, timezone
from typing import Any

from app.analytics import compute_alert, compute_metrics, percentile, timeseries

NOW = datetime(2026, 9, 29, 10, 30, 15, tzinfo=timezone.utc)


def row(status: str = "approved", retries: int = 0, ms: int = 1000, minute: int = 29,
        injected: bool = False, claims: list[dict[str, Any]] | None = None,
        flags: list[str] | None = None, id_: int = 1) -> dict[str, Any]:
    return {"id": id_, "ts": f"2026-09-29T10:{minute:02d}:00.000Z", "status": status,
            "retries": retries, "injected": injected, "trust_score": 100 - 10 * retries,
            "timings": {"total_ms": ms, "nodes": {"maker": ms // 2, "judge": ms // 2}},
            "drafts": [{"claims": claims or []}], "input_flags": flags or [], "question": "q"}


def test_percentile_nearest_rank() -> None:
    assert percentile([], 95) is None
    assert percentile([5], 95) == 5
    assert percentile(list(range(1, 101)), 95) == 95
    assert percentile([1, 2, 3, 4], 50) == 2


def test_metrics_rates_and_catch() -> None:
    rows = [row(), row("corrected", 1, injected=True,
                       claims=[{"verdict": "contradicted", "caught_by": "rules"}]),
            row("escalated", 2, injected=True), row(flags=["prompt_injection"]),
            row(flags=["pii_redacted"])]
    m = compute_metrics(rows, now=NOW)
    assert m["total"] == 5
    assert m["counts"] == {"approved": 3, "corrected": 1, "escalated": 1}
    assert m["blocked"] == 2 and m["blocked_rate_pct"] == 40.0
    assert m["injected"] == {"total": 2, "caught": 2, "catch_rate_pct": 100.0}
    assert m["caught_by"] == {"judge": 0, "rules": 1}
    assert m["flagged_inputs"] == 1  # pii_redacted alone isn't a risk flag
    assert m["node_avg_ms"] == {"maker": 500, "judge": 500}


def test_empty_metrics() -> None:
    m = compute_metrics([], now=NOW)
    assert m["total"] == 0 and m["blocked_rate_pct"] is None and m["latency_ms"]["p95"] is None


def test_timeseries_is_dense_and_bucketed() -> None:
    series = timeseries([row(minute=29), row(minute=29, status="corrected", retries=1),
                         row(minute=20)], now=NOW, minutes=10)
    assert len(series) == 10
    assert series[-1]["minute"] == "2026-09-29T10:30Z" and series[-1]["total"] == 0
    assert series[-2] == {"minute": "2026-09-29T10:29Z", "total": 2, "approved": 1,
                          "corrected": 1, "escalated": 0, "blocked": 1, "p95_ms": 1000}
    assert sum(p["total"] for p in series) == 2  # minute 20 is outside the 10-minute window


def test_alert_fires_above_threshold() -> None:
    rows = [row("corrected", 1, id_=1), row("escalated", 2, id_=2), row(id_=3)]
    a = compute_alert(rows, threshold_pct=30, window_min=10)
    assert a["active"] and a["blocked_rate_pct"] == 66.7
    assert [r["id"] for r in a["recent_failing"]] == [1, 2]
    assert "66.7%" in a["message"]


def test_alert_needs_minimum_sample() -> None:
    a = compute_alert([row("escalated", 2)], threshold_pct=30, window_min=10)
    assert not a["active"] and a["blocked_rate_pct"] == 100.0


def test_alert_quiet_below_threshold() -> None:
    assert not compute_alert([row(), row(), row(), row("corrected", 1)],
                             threshold_pct=30, window_min=10)["active"]
