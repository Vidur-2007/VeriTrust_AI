"""Chroma collections: manual_chunks (unstructured manuals) and facts (verified DB statements).

We always pass our own embeddings (from llm.embed), so collections have no embedding function.
Query helpers arrive with the graph in Phase 2.
"""

from typing import Any, Literal

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

from app.config import get_settings

CollectionName = Literal["manual_chunks", "facts"]
COLLECTIONS: tuple[CollectionName, ...] = ("manual_chunks", "facts")

_client: ClientAPI | None = None


def get_client() -> ClientAPI:
    global _client
    if _client is None:
        path = get_settings().chroma_dir
        path.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(path))
    return _client


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
