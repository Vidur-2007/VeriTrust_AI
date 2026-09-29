"""Run the evaluation from the command line. Results go to the eval_runs table and
backend/var/eval_results.json.

Usage (from backend/):
  python scripts/run_eval.py --mode all [--limit 5] [--ids E01 E06] [--types stale_trap]

Gemini only by default: the local model is switched off for this process (the server keeps its
own settings), so every number comes from one model family. When the free quota runs out, the
remaining questions are recorded as skipped. Run the same command again later to finish: every
call that already succeeded comes from the LLM cache and costs nothing.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # ₹, Hindi, Telugu on the Windows console


def print_metrics(metrics: dict) -> None:
    print("\nMETRICS")
    for mode, m in metrics["modes"].items():
        extras = {k: v for k, v in m.items() if k not in ("n", "latency_ms", "hallucinations")}
        print(f"  {mode:<9} n={m['n']:<3} p50={m['latency_ms']['p50']} ms  "
              f"p95={m['latency_ms']['p95']} ms  {extras}")
    if metrics.get("comparison"):
        print(f"  comparison: {metrics['comparison']}")
    print(f"  models used: {metrics.get('models_used')}  skipped: {metrics.get('skipped')} "
          f"{metrics.get('skipped_by_mode') or ''}")


async def main(a: argparse.Namespace) -> None:
    from app import db, evaluation
    from app.config import get_settings

    db.init_db()
    gemini_only = not a.allow_local
    print(f"Models: {'Gemini only' if gemini_only else 'Gemini, falling back to the local model'}")
    async for event, data in evaluation.run_eval(a.mode, limit=a.limit, question_ids=a.ids,
                                                 types=a.types, gemini_only=gemini_only):
        if event == "start":
            print(f"Eval {data['mode']}: {data['questions']} questions, {data['total']} runs")
        elif event == "waiting":
            print(f"  ... every Gemini model is cooling down; waiting {data['seconds']} s, then "
                  f"retrying {data['mode']} {data['id']} (attempt {data['attempt'] + 1})",
                  flush=True)
        elif event == "question":
            r = data["record"]
            outcome = "SKIPPED " + r["error"][:90] if r.get("skipped") else (
                f"{r['status']:<10} hallucinated={r['hallucinated']!s:<5} {r['ms']} ms")
            print(f"  [{data['done']}/{data['total']}] {r['mode']:<9} {r['id']} {outcome}",
                  flush=True)
        elif event == "done":
            print_metrics(data["metrics"])
            out = get_settings().data_dir / "eval_results.json"
            out.write_text(json.dumps(db.latest_eval_run(), ensure_ascii=False, indent=2),
                           encoding="utf-8")
            print(f"  saved eval_runs #{data['eval_run_id']} and {out}")
            if data["metrics"].get("skipped"):
                print("  Some questions were skipped (quota or model failures). Run the same "
                      "command again later to finish; finished calls come from the cache.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["baseline", "guarded", "injected", "all"], default="all")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--types", nargs="*",
                    choices=["answerable", "stale_trap", "adversarial", "out_of_scope"])
    ap.add_argument("--allow-local", action="store_true",
                    help="let calls fall back to the local model when Gemini is unavailable")
    args = ap.parse_args()
    if not args.allow_local:
        os.environ["LLM_FALLBACK"] = "false"  # before the settings are first read
    asyncio.run(main(args))
