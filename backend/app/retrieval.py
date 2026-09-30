"""Chroma collections: manual_chunks (unstructured manuals) and facts (verified DB statements).

We always pass our own embeddings (from llm.embed), so collections have no embedding function.
Search falls back to lexical overlap when the query can't be embedded.
"""

import logging
import math
import re
from typing import Any, Literal

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection
from pydantic import BaseModel

from app import llm
from app.config import get_settings

log = logging.getLogger("veritrust.retrieval")

CollectionName = Literal["manual_chunks", "facts"]
COLLECTIONS: tuple[CollectionName, ...] = ("manual_chunks", "facts")

_clients: dict[str, ClientAPI] = {}  # one per domain pack's Chroma directory


def get_client() -> ClientAPI:
    path = get_settings().chroma_dir
    key = str(path)
    if key not in _clients:
        path.mkdir(parents=True, exist_ok=True)
        _clients[key] = chromadb.PersistentClient(path=key)
    return _clients[key]


def get_collection(name: CollectionName, metadata: dict[str, Any] | None = None) -> Collection:
    return get_client().get_or_create_collection(
        name, metadata={"hnsw:space": "cosine", **(metadata or {})}, embedding_function=None
    )


def drop_collection(name: CollectionName) -> None:
    if name in {c.name for c in get_client().list_collections()}:
        get_client().delete_collection(name)


def collection_info() -> dict[str, Any]:
    existing = {c.name for c in get_client().list_collections()}
    info: dict[str, Any] = {}
    for name in COLLECTIONS:
        if name in existing:
            col = get_collection(name)
            info[name] = col.count()
            info.setdefault("embed_model", (col.metadata or {}).get("embed_model"))
        else:
            info[name] = 0
    return info


# ---------------------------------------------------------------- search

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOP = {"the", "and", "for", "are", "can", "you", "your", "my", "how", "what", "when", "does",
         "with", "much", "will", "per", "our", "any", "this", "that", "from", "have", "is", "a",
         "an", "of", "to", "in", "on", "i", "it", "be", "or", "if", "do", "me", "at", "by"}


class Hit(BaseModel):
    id: str
    document: str
    metadata: dict[str, Any]
    score: float


def tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOP and len(t) > 1}


def lexical_search(name: CollectionName, query: str, k: int) -> list[Hit]:
    """Token-overlap search. Used when the query can't be embedded (e.g. Gemini is down)."""
    q = tokens(query)
    got = get_collection(name).get(include=["documents", "metadatas"])
    scored = []
    for id_, doc, meta in zip(got["ids"], got["documents"] or [], got["metadatas"] or []):
        overlap = len(q & tokens(doc or ""))
        if overlap:
            scored.append(Hit(id=id_, document=doc or "", metadata=dict(meta or {}),
                              score=overlap / math.sqrt(len(tokens(doc or "")) or 1)))
    return sorted(scored, key=lambda h: h.score, reverse=True)[:k]


def vector_search(name: CollectionName, vector: list[float], k: int) -> list[Hit]:
    r = get_collection(name).query(query_embeddings=[vector], n_results=k,
                                   include=["documents", "metadatas", "distances"])
    return [Hit(id=i, document=d or "", metadata=dict(m or {}), score=1 - dist)
            for i, d, m, dist in zip(r["ids"][0], (r["documents"] or [[]])[0],
                                     (r["metadatas"] or [[]])[0], (r["distances"] or [[]])[0])]


async def embed_query(text: str) -> list[float] | None:
    """Embed with the provider the collections were built with. None if that fails."""
    provider = (get_collection("facts").metadata or {}).get("embed_provider")
    try:
        return (await llm.embed([text], task="query", provider=provider,
                                allow_long_wait=False))[0]
    except llm.LLMError as e:
        log.warning("Query embedding failed (%s); using lexical search", e.message)
        return None


async def search(name: CollectionName, query: str, k: int,
                 vector: list[float] | None = None) -> tuple[list[Hit], str]:
    """Vector search when possible, else lexical. Returns (hits, mode)."""
    if vector is None:
        vector = await embed_query(query)
    if vector is not None:
        return vector_search(name, vector, k), "vector"
    return lexical_search(name, query, k), "lexical"
