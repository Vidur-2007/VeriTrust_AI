"""Domain packs (FEATURES #25): the same guardrail over a different company's knowledge base.

A pack is data, not logic: verified facts, manuals, red-team attacks, eval questions, the fact
categories, and the company named in the prompts. The graph, rules, scoring and policy are
shared. Each pack keeps its own SQLite file and Chroma index (see Settings.domain_dir), so
switching swaps the knowledge base and its history without touching the other pack's data.

The airline is the default and lives where it always did: data/ and backend/var/.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app import config
from app.config import DATA_SOURCE_DIR
from app.schemas import BankJudgeOut, JudgeOut


@dataclass(frozen=True)
class Domain:
    id: str
    name: str                       # the company, as shown in the UI
    industry: str
    source_dir: Path                # facts.json, manuals/, redteam/, eval/
    categories: dict[str, str]      # fact category -> label
    prefixes: dict[str, str]        # fact category -> fact id prefix
    high_risk: list[str]            # default high-risk categories
    judge_schema: type[BaseModel]   # the Judge's structured output (category is an enum)
    has_site: bool = False          # a customer demo site exists for this pack
    # None = the console examples etc. come from the pack's examples.json
    demo_attacks: list[str] | None = field(default=None)

    @property
    def facts_file(self) -> Path:
        return self.source_dir / "facts.json"

    @property
    def manuals_dir(self) -> Path:
        return self.source_dir / "manuals"

    @property
    def attacks_file(self) -> Path:
        return self.source_dir / "redteam" / "attacks.json"

    @property
    def questions_file(self) -> Path:
        return self.source_dir / "eval" / "questions.jsonl"

    def examples(self) -> dict[str, Any]:
        """Example questions for the console and palette. The airline's are built into the UI."""
        path = self.source_dir / "examples.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


AIRLINE = Domain(
    id="airline", name="Charminar Airways", industry="Airline", source_dir=DATA_SOURCE_DIR,
    categories={"baggage": "Baggage", "fees": "Fees", "refunds": "Refunds",
                "cancellations": "Cancellations", "check_in": "Check-in", "loyalty": "Loyalty",
                "special_assistance": "Special assistance", "pets": "Pets"},
    prefixes={"baggage": "BAG", "fees": "FEE", "refunds": "REF", "cancellations": "CAN",
              "check_in": "CHK", "loyalty": "LOY", "special_assistance": "SPA", "pets": "PET"},
    high_risk=["fees", "refunds", "baggage"], judge_schema=JudgeOut, has_site=True,
    demo_attacks=["ATK-01", "ATK-02", "ATK-03", "ATK-04", "ATK-06", "ATK-07", "ATK-10",
                  "ATK-13", "ATK-16", "ATK-19"],
)

BANK = Domain(
    id="bank", name="Golconda Bank", industry="Bank",
    source_dir=DATA_SOURCE_DIR / "packs" / "bank",
    categories={"accounts": "Accounts", "cards": "Cards", "loans": "Loans", "kyc": "KYC",
                "transfers": "Transfers"},
    prefixes={"accounts": "ACC", "cards": "CRD", "loans": "LON", "kyc": "KYC",
              "transfers": "TRF"},
    high_risk=["accounts", "cards", "loans"], judge_schema=BankJudgeOut,
)

DOMAINS: dict[str, Domain] = {d.id: d for d in (AIRLINE, BANK)}


def get(domain_id: str) -> Domain:
    return DOMAINS[domain_id]


def active() -> Domain:
    return DOMAINS.get(config.active_domain(), AIRLINE)
