"""Run the evaluation from the command line. Results go to the eval_runs table and
backend/var/eval_results.json.

Usage (from backend/):  python scripts/run_eval.py --mode all [--limit 5] [--ids E01 E06]
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # ₹, Hindi, Telugu on the Windows console

from app import db, evaluation  # noqa: E402
from app.config import get_settings  # noqa: E402


def print_metrics(metrics: dict) -> None:
    print("\nMETRICS")
    for mode, m in metrics["modes"].items():
        extras = {k: v for k, v in m.items() if k not in ("n", "latency_ms", "hallucinations")}
        print(f"  {mode:<9} n={m['n']:<3} p50={m['latency_ms']['p50']} ms  "
              f"p95={m['latency_ms']['p95']} ms  {extras}")
    if metrics.get("comparison"):
        print(f"  comparison: {metrics['comparison']}")
    print(f"  models used: {metrics.get('models_used')}  skipped: {metrics.get('skipped')}")


async def main(mode: str, limit: int | None, ids: list[str] | None) -> None:
    db.init_db()
    async for event, data in evaluation.run_eval(mode, limit=limit, question_ids=ids):  # type: ignore[arg-type]
        if event == "start":
            print(f"Eval {data['mode']}: {data['questions']} questions, {data['total']} runs")
        elif event == "question":
            r = data["record"]
            outcome = "ERROR " + r["error"] if r.get("skipped") else (
                f"{r['status']:<10} hallucinated={r['hallucinated']!s:<5} {r['ms']} ms")
            print(f"  [{data['done']}/{data['total']}] {r['mode']:<9} {r['id']} {outcome}")
        elif event == "done":
            print_metrics(data["metrics"])
            out = get_settings().data_dir / "eval_results.json"
            out.write_text(json.dumps(db.latest_eval_run(), ensure_ascii=False, indent=2),
                           encoding="utf-8")
            print(f"  saved eval_runs #{data['eval_run_id']} and {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["baseline", "guarded", "injected", "all"], default="all")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--ids", nargs="*")
    a = ap.parse_args()
    asyncio.run(main(a.mode, a.limit, a.ids))
