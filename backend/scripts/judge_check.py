"""Quick Judge calibration: catch rate on injected errors, false-block rate on clean answers.

Injected questions avoid the 4 planted stale facts, so every error is the Maker's injection.
Prints the drafts and claims of every miss so the Judge prompt can be tuned from real examples.

Usage (from backend/):  python scripts/judge_check.py [--only-injected | --only-clean]
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # ₹, Hindi, Telugu on the Windows console

from app import db  # noqa: E402
from app.graph.run import run_chat  # noqa: E402
from app.schemas import ChatRequest, ChatResult  # noqa: E402

INJECTED = [
    "What is the checked baggage allowance on a domestic Saver fare?",
    "What is the maximum weight for a single checked bag?",
    "How much is the convenience fee for booking online?",
    "How much does an extra legroom seat cost on a domestic flight?",
    "How long is a credit shell valid?",
    "What is the fee to cancel a domestic booking 5 days before departure?",
    "When do airport check-in counters close for international flights?",
    "How many Tier Miles do I need for Gold status?",
    "How far in advance should I request wheelchair assistance?",
    "What is the maximum weight for a pet travelling in the cabin?",
]
CLEAN = [
    "When does web check-in open?",
    "How long do refunds to my card take?",
    "Do Charminar Miles expire?",
    "Can I bring my golf bag on a domestic flight, and what does it cost?",
    "What is the cancellation fee for an international booking?",
    "Until which week of pregnancy can I fly?",
]


def first_draft_blocked(r: ChatResult) -> bool:
    return r.retries > 0 or r.status == "escalated"


def dump(r: ChatResult) -> None:
    for d in r.drafts:
        extra = f"  injected: {d.injected_detail}" if d.injected_detail else ""
        print(f"    draft {d.retry}: {d.text}{extra}")
        for c in d.claims:
            print(f"      {c.verdict:<12} {c.caught_by or '':<6} {c.category:<12} "
                  f"{c.evidence_fact_ids} :: {c.text_en}")


async def run_set(questions: list[str], inject: bool) -> list[tuple[str, ChatResult]]:
    out = []
    for q in questions:
        r = await run_chat(ChatRequest(question=q, inject=inject, channel="eval"))
        flag = "BLOCKED" if first_draft_blocked(r) else "passed "
        models = sorted({s["provider"] or "" for s in r.timings["spans"] if s["provider"]})
        print(f"  {flag} {r.status:<10} retries={r.retries} trust={r.trust_score:<3} "
              f"{r.timings['total_ms']:>6} ms {models}  {q}")
        out.append((q, r))
    return out


async def main(do_injected: bool, do_clean: bool) -> None:
    db.init_db()
    caught = escaped = no_injection = false_blocks = 0
    inj: list[tuple[str, ChatResult]] = []
    clean: list[tuple[str, ChatResult]] = []

    if do_injected:
        print("INJECTED (should be blocked, then corrected)")
        inj = await run_set(INJECTED, inject=True)
    if do_clean:
        print("\nCLEAN (should pass first time)")
        clean = await run_set(CLEAN, inject=False)

    misses = []
    for q, r in inj:
        injected = r.drafts[0].injected_detail if r.drafts else None
        if not injected:
            no_injection += 1
            misses.append(("Maker did not report an injection", q, r))
        elif first_draft_blocked(r):
            caught += 1
        else:
            escaped += 1
            misses.append(("ESCAPED: injected error approved", q, r))
    for q, r in clean:
        if first_draft_blocked(r):
            false_blocks += 1
            misses.append(("FALSE BLOCK: clean answer blocked", q, r))

    if misses:
        print("\nDETAILS")
        for why, q, r in misses:
            print(f"\n  {why}\n  Q: {q}")
            dump(r)

    print("\nSUMMARY")
    if inj:
        tested = caught + escaped
        print(f"  injected: {caught}/{tested} caught ({caught / tested:.0%})" if tested else
              "  injected: none tested")
        print(f"  corrected after catch: {sum(r.status == 'corrected' for _, r in inj)}"
              f"  escalated: {sum(r.status == 'escalated' for _, r in inj)}"
              f"  Maker skipped injection: {no_injection}")
    if clean:
        print(f"  clean: {false_blocks}/{len(clean)} falsely blocked "
              f"({false_blocks / len(clean):.0%})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--only-injected", action="store_true")
    g.add_argument("--only-clean", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(not a.only_clean, not a.only_injected))
