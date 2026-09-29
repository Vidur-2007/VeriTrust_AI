"""The support manuals (unstructured markdown) and how they are split into sections."""

import re
from pathlib import Path
from typing import Any

from app.config import DATA_SOURCE_DIR

MANUALS_DIR = DATA_SOURCE_DIR / "manuals"


def manual_paths() -> list[Path]:
    return sorted(MANUALS_DIR.glob("*.md"))


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def chunk_manual(path: Path) -> list[dict[str, Any]]:
    """One chunk per `##` section, prefixed with the manual title for retrieval context."""
    lines = path.read_text(encoding="utf-8").splitlines()
    title = next((ln[2:].strip() for ln in lines if ln.startswith("# ")), path.stem)
    chunks: list[dict[str, Any]] = []
    section: str | None = None
    body: list[str] = []

    def flush() -> None:
        text = "\n".join(body).strip()
        if section and text:
            chunks.append({
                "id": f"{path.name}#{slugify(section)}",
                "document": f"{title}\n## {section}\n\n{text}",
                "metadata": {"manual": path.name, "section": section,
                             "heading_path": f"{title} > {section}"},
            })

    for ln in lines:
        if ln.startswith("## "):
            flush()
            section, body = ln[3:].strip(), []
        elif section:
            body.append(ln)
    flush()
    return chunks
