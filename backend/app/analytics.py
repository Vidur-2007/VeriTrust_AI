"""Dashboard metrics and alerts, computed from interaction rows (pure functions)."""

import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

STATUSES = ("approved", "corrected", "escalated")


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def minutes_ago(minutes: float, now: datetime | None = None) -> str:
    return iso((now or datetime.now(timezone.utc)) - timedelta(minutes=minutes))


def percentile(values: list[float], pct: float) -> float | None:
    """Nearest-rank percentile."""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(pct / 100 * len(ordered)) - 1)]


def is_blocked(row: dict[str, Any]) -> bool:
    """A draft was blocked: the answer was rewritten or escalated."""
    return (row.get("retries") or 0) > 0 or row.get("status") == "escalated"


def _pct(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def _total_ms(row: dict[str, Any]) -> int | None:
    return (row.get("timings") or {}).get("total_ms")


def compute_metrics(rows: list[dict[str, Any]], *, now: datetime | None = None,
                    series_minutes: int = 60) -> dict[str, Any]:
    n = len(rows)
    status = Counter(r.get("status") for r in rows)
    blocked = sum(is_blocked(r) for r in rows)
    latencies = [ms for r in rows if (ms := _total_ms(r)) is not None]
    trust = [r["trust_score"] for r in rows if r.get("trust_score") is not None]

    node_ms: dict[str, list[int]] = defaultdict(list)
    for r in rows:
        for node, ms in ((r.get("timings") or {}).get("nodes") or {}).items():
            node_ms[node].append(ms)

    injected = [r for r in rows if r.get("injected")]
    caught_by: Counter[str] = Counter()
    for r in rows:
        for d in r.get("drafts") or []:
            for c in d.get("claims") or []:
                if c.get("verdict") != "supported":
                    caught_by[c.get("caught_by") or "judge"] += 1

    return {
        "total": n,
        "counts": {s: status.get(s, 0) for s in STATUSES},
        "rates_pct": {s: _pct(status.get(s, 0), n) for s in STATUSES},
        "blocked": blocked,
        "blocked_rate_pct": _pct(blocked, n),
        "avg_trust": round(sum(trust) / len(trust), 1) if trust else None,
        "latency_ms": {
            "avg": round(sum(latencies) / len(latencies)) if latencies else None,
            "p50": percentile(latencies, 50),
            "p95": percentile(latencies, 95),
        },
        "node_avg_ms": {k: round(sum(v) / len(v)) for k, v in node_ms.items()},
        "injected": {"total": len(injected),
                     "caught": sum(is_blocked(r) for r in injected),
                     "catch_rate_pct": _pct(sum(is_blocked(r) for r in injected), len(injected))},
        "caught_by": {"judge": caught_by.get("judge", 0), "rules": caught_by.get("rules", 0)},
        "flagged_inputs": sum(bool(set(r.get("input_flags") or []) - {"pii_redacted"})
                              for r in rows),
        "timeseries": timeseries(rows, now=now, minutes=series_minutes),
    }


def timeseries(rows: list[dict[str, Any]], *, now: datetime | None = None,
               minutes: int = 60) -> list[dict[str, Any]]:
    """One point per minute for the last `minutes`, zero-filled so charts have no gaps."""
    now = (now or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        buckets[r["ts"][:16]].append(r)  # "2026-09-29T10:11"
    out = []
    for i in range(minutes - 1, -1, -1):
        key = (now - timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M")
        rs = buckets.get(key, [])
        status = Counter(r.get("status") for r in rs)
        lat = [ms for r in rs if (ms := _total_ms(r)) is not None]
        out.append({"minute": key + "Z", "total": len(rs),
                    **{s: status.get(s, 0) for s in STATUSES},
                    "blocked": sum(is_blocked(r) for r in rs), "p95_ms": percentile(lat, 95)})
    return out


def compute_alert(rows: list[dict[str, Any]], *, threshold_pct: float, window_min: int,
                  min_requests: int = 3) -> dict[str, Any]:
    """rows: interactions in the window. Fires when the blocked rate exceeds the threshold."""
    blocked_rows = [r for r in rows if is_blocked(r)]
    rate = _pct(len(blocked_rows), len(rows))
    active = len(rows) >= min_requests and rate is not None and rate > threshold_pct
    return {
        "active": active,
        "blocked_rate_pct": rate,
        "threshold_pct": threshold_pct,
        "window_min": window_min,
        "total": len(rows),
        "blocked": len(blocked_rows),
        "min_requests": min_requests,
        "message": (f"{rate}% of answers were blocked in the last {window_min} min "
                    f"(threshold {threshold_pct}%)." if active else None),
        "recent_failing": [{"id": r["id"], "ts": r["ts"], "status": r["status"],
                            "retries": r["retries"], "question": r["question"]}
                           for r in blocked_rows[:10]],
    }
