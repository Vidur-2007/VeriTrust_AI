"""Run the evaluation from the command line. Results go to the eval_runs table and
backend/var/eval_results.json (eval_results_ollama.json for a local run).

Usage (from backend/):
  python scripts/run_eval.py --mode all [--limit 5] [--ids E01 E06] [--types stale_trap]
  python scripts/run_eval.py --provider ollama --sample 24      # model comparison

Gemini only by default: the local model is switched off for this process (the server keeps its
own settings), so every number comes from one model family. When the free quota runs out, the
remaining questions are recorded as skipped. Run the same command again later to finish: every
call that already succeeded comes from the LLM cache and costs nothing.

--provider ollama: the local model (Ollama) is the Maker and the Judge, and Gemini still grades
the final answers so the two runs can be compared on the Evaluation page. It is slow (minutes per
question) and safe to stop: every finished record is appended to
backend/var/eval_progress_ollama.jsonl, and the same command picks up where it stopped. Answers
Gemini couldn't grade (quota) are kept as "waiting for a grade" and graded by a later rerun.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
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
          f"{metrics.get('skipped_by_mode') or ''}  waiting for a grade: {metrics.get('ungraded')}")


def outcome(r: dict) -> str:
    if r.get("ungraded"):
        return f"answered, waiting for a grade ({r['error'][:70]})"
    if r.get("skipped"):
        return "SKIPPED " + r["error"][:90]
    return f"{r['status']:<10} hallucinated={r['hallucinated']!s:<5}"


def eta(started: float, done: int, total: int) -> str:
    left = (time.monotonic() - started) / done * (total - done)
    return f"about {left / 3600:.1f} h left" if left >= 3600 else f"about {left / 60:.0f} min left"


async def main(a: argparse.Namespace) -> int:
    from app import db, domains, evaluation, llm
    from app.config import get_settings

    db.init_db()
    print(f"Domain pack: {domains.active().name}")
    local = a.provider == "ollama"
    gemini_only = not a.allow_local and not local
    if local:
        if not await llm.ollama_reachable(3.0):
            print(f"Can't reach Ollama at {get_settings().ollama_url}. Start it (ollama serve) "
                  f"and pull the model: ollama pull {get_settings().ollama_model}")
            return 1
        print(f"Models: {get_settings().ollama_model} (local) answers, Gemini grades")
    else:
        print(f"Models: {'Gemini only' if gemini_only else 'Gemini, falling back to the local model'}")

    # The checkpoint keeps live timings across an interrupted run and shows progress to the page.
    prior, _ = evaluation.read_checkpoint(a.provider)
    checkpoint = evaluation.checkpoint_path(a.provider)
    started = time.monotonic()

    def log(row: dict) -> None:
        with checkpoint.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    async for event, data in evaluation.run_eval(a.mode, limit=a.limit, question_ids=a.ids,
                                                 types=a.types, gemini_only=gemini_only,
                                                 provider=a.provider, sample=a.sample,
                                                 prior_records=prior):
        if event == "start":
            print(f"Eval {data['mode']}: {data['questions']} questions, {data['total']} runs")
            log({"run_started": datetime.now(timezone.utc).isoformat(), "total": data["total"]})
        elif event == "waiting":
            print(f"  ... every Gemini model is cooling down; waiting {data['seconds']} s, then "
                  f"retrying {data['mode']} {data['id']} (attempt {data['attempt'] + 1})",
                  flush=True)
        elif event == "question":
            r = data["record"]
            log(r)
            took = f"{r['ms'] / 1000:.0f} s" + (" cached" if r.get("cached") else "") if "ms" in r else "-"
            print(f"  [{data['done']}/{data['total']}] {r['mode']:<9} {r['id']} {outcome(r)}  "
                  f"{took}  {eta(started, data['done'], data['total'])}", flush=True)
        elif event == "done":
            log({"run_finished": datetime.now(timezone.utc).isoformat()})
            print_metrics(data["metrics"])
            out = get_settings().data_dir / ("eval_results_ollama.json" if local
                                             else "eval_results.json")
            out.write_text(json.dumps(db.latest_eval_run(a.provider), ensure_ascii=False,
                                      indent=2), encoding="utf-8")
            print(f"  saved eval_runs #{data['eval_run_id']} and {out}")
            if data["metrics"].get("skipped"):
                print("  Some answers were skipped or are waiting for a grade (quota or model "
                      "failures). Run the same command again later to finish; finished calls "
                      "come from the cache.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["baseline", "guarded", "injected", "all"], default="all")
    ap.add_argument("--provider", choices=["gemini", "ollama"], default="gemini",
                    help="the model that answers (Maker and Judge); Gemini always grades")
    ap.add_argument("--sample", type=int,
                    help="run a fixed sample of N questions with the full set's mix of types")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--types", nargs="*",
                    choices=["answerable", "stale_trap", "adversarial", "out_of_scope"])
    ap.add_argument("--allow-local", action="store_true",
                    help="let calls fall back to the local model when Gemini is unavailable")
    ap.add_argument("--domain", help="the domain pack to evaluate, e.g. bank "
                                     "(default: the active one)")
    args = ap.parse_args()
    if args.domain:
        os.environ["VERITRUST_DOMAIN"] = args.domain  # this process only
    # Before the settings are first read: one model family per process.
    if args.provider == "ollama":
        os.environ["LLM_PROVIDER"] = "ollama"
        os.environ["LLM_FALLBACK"] = "false"
    elif not args.allow_local:
        os.environ["LLM_FALLBACK"] = "false"
    sys.exit(asyncio.run(main(args)))
