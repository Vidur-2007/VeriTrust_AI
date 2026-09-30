"""Load verified facts into SQLite and build both Chroma collections. Safe to re-run.

Usage (from backend/):  python scripts/seed.py [--reset] [--domain bank]

Each domain pack has its own database and index. Without --domain this seeds the pack that is
currently active (the airline unless the app was switched).
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # ₹, Hindi, Telugu on the Windows console

from app import db, domains, llm, retrieval  # noqa: E402
from app.manuals import chunk_manual, manual_paths  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.retrieval import CollectionName  # noqa: E402


def load_facts() -> list[db.Fact]:
    raw = json.loads(domains.active().facts_file.read_text(encoding="utf-8"))
    facts = [db.Fact(**f) for f in raw]
    ids = [f.id for f in facts]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f"Duplicate fact ids in facts.json: {sorted(dupes)}")
    return facts


async def build_collection(name: CollectionName, items: list[dict[str, Any]],
                           reset: bool) -> tuple[int, int]:
    """Upsert items into a collection, rebuilding it if the embed model changed.

    Returns (count, removed_orphans).
    """
    provider, model = llm.embed_identity()
    identity = {"embed_provider": provider, "embed_model": model}
    col = retrieval.get_collection(name, identity)
    current = {k: (col.metadata or {}).get(k) for k in identity}
    if reset or current != identity:
        if not reset:
            print(f"  {name}: embed model changed {current} -> {identity}, rebuilding")
        retrieval.drop_collection(name)
        col = retrieval.get_collection(name, identity)

    vectors = await llm.embed([it["document"] for it in items], task="document")
    col.upsert(
        ids=[it["id"] for it in items],
        embeddings=vectors,
        documents=[it["document"] for it in items],
        metadatas=[it["metadata"] for it in items],
    )
    orphans = sorted(set(col.get(include=[])["ids"]) - {it["id"] for it in items})
    if orphans:
        col.delete(ids=orphans)
    return col.count(), len(orphans)


async def main(reset: bool) -> None:
    t0 = time.perf_counter()
    s = get_settings()
    print(f"Domain pack: {domains.active().name}  ->  {s.domain_dir}")

    db.init_db()
    facts = load_facts()
    db.upsert_facts(facts)
    removed = db.delete_facts_not_in({f.id for f in facts})
    print(f"SQLite facts: {len(facts)} upserted, {len(removed)} removed {removed or ''}")

    fact_items = [{
        "id": f.id,
        "document": f.statement,
        "metadata": {"fact_id": f.id, "category": f.category,
                     "subject": f.subject, "attribute": f.attribute},
    } for f in facts]
    chunk_items = [c for p in manual_paths() for c in chunk_manual(p)]

    provider, model = llm.embed_identity()
    print(f"Embedding with {provider}:{model} ...")
    n_facts, orphan_f = await build_collection("facts", fact_items, reset)
    n_chunks, orphan_c = await build_collection("manual_chunks", chunk_items, reset)
    print(f"Chroma facts: {n_facts} ({orphan_f} orphans removed)")
    print(f"Chroma manual_chunks: {n_chunks} from "
          f"{len({c['metadata']['manual'] for c in chunk_items})} manuals ({orphan_c} orphans removed)")
    print(f"Settings: {db.get_settings_map()}")
    print(f"Done in {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--reset", action="store_true", help="drop and rebuild Chroma collections")
    ap.add_argument("--domain", choices=sorted(domains.DOMAINS),
                    help="the domain pack to seed (default: the active one)")
    args = ap.parse_args()
    if args.domain:
        os.environ["VERITRUST_DOMAIN"] = args.domain  # this process only
    try:
        asyncio.run(main(args.reset))
    except llm.LLMError as e:
        raise SystemExit(f"Seeding failed ({e.provider}, {e.kind}): {e.message}")
