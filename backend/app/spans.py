"""Locate claim text inside a draft. The LLM quotes the claim; the server computes the indices.

Indices are Python code points, which match JavaScript string indices for all en/hi/te text and
the ₹ sign (all in the Basic Multilingual Plane). Emoji would differ.
"""

from difflib import SequenceMatcher

MIN_FUZZY_CHARS = 8
MIN_FUZZY_RATIO = 0.6


def locate(draft: str, text: str) -> tuple[int | None, int | None]:
    if not text:
        return None, None
    i = draft.find(text)
    if i < 0:
        i = draft.lower().find(text.lower())
    if i >= 0:
        return i, i + len(text)
    m = SequenceMatcher(None, draft, text, autojunk=False).find_longest_match(
        0, len(draft), 0, len(text))
    if m.size >= max(MIN_FUZZY_CHARS, MIN_FUZZY_RATIO * len(text)):
        return m.a, m.a + m.size
    return None, None
