"""Put real escalated cases in the human review queue for demo step 8.

Each question runs through the full guardrail with no rewrites allowed, so when the Judge blocks
the first draft the customer gets the safe hand-off and the case waits for a person. Nothing is
faked: the drafts, claims and trace in the queue are the real ones.

  1. The missing fact: "Can I bring my guitar on the plane?" The baggage manual covers musical
     instruments, but no verified fact does (the planted knowledge gap in data/STALE.md), so the
     Judge cannot support the answer. In the demo the reviewer saves the rule as a new fact.
  2. A caught error: the refund question with one false detail injected into the draft.

Run the manual index first if the instruments section is new: python scripts/seed.py
Usage (from backend/):  python scripts/seed_review.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # ₹, Hindi, Telugu on the Windows console

from app import db  # noqa: E402
from app.graph.run import run_chat  # noqa: E402
from app.schemas import ChatRequest  # noqa: E402

CASES = [
    ("The missing fact", ChatRequest(question="Can I bring my guitar on the plane?")),
    ("A caught error", ChatRequest(question="How long does a refund take if I cancel my flight?",
                                   inject=True)),
]


async def main() -> None:
    db.init_db()
    waiting = {r["question"] for r in db.select_interactions(review_status="pending")}
    for label, req in CASES:
        if req.question in waiting:
            print(f"- {label}: already waiting in the queue, skipped")
            continue
        r = await run_chat(req, batch=True, max_retries=0)
        blocked = [c for c in (r.drafts[0].claims if r.drafts else []) if c.verdict != "supported"]
        print(f"- {label}: interaction #{r.interaction_id} {r.status}")
        for c in blocked:
            print(f"    {c.verdict}: {c.text_en}")
        if r.error:
            print(f"    (every model failed: {r.error['message']}) Run again when Gemini is back.")
        elif r.status != "escalated":
            print("    Not escalated: the Judge supported every claim this time. Nothing was queued.")
    print(f"Waiting for review: {db.count_interactions(review_status='pending')}")


if __name__ == "__main__":
    asyncio.run(main())
