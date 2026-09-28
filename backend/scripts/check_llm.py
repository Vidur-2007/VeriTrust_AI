"""Smoke test for app/llm.py: one structured call per provider, a cache hit, and embeddings.

Usage (from backend/):
  python scripts/check_llm.py --provider both
  python scripts/check_llm.py --fallback      # simulate Gemini outage, expect Ollama to answer
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")  # ₹, Hindi, Telugu on the Windows console

from pydantic import BaseModel  # noqa: E402

from app import llm  # noqa: E402

PROMPT = (
    "You are a support agent for Charminar Airways. Using only this fact, answer the question.\n"
    "Fact: Each passenger may carry one cabin bag weighing up to 7 kg.\n"
    "Question: How heavy can my cabin bag be?"
)


class Answer(BaseModel):
    language: str
    answer: str


def show(label: str, r: llm.LLMResult[Answer]) -> None:
    print(f"[{label}] provider={r.provider} model={r.model} cached={r.cached} ms={r.ms}")
    print(f"    {r.data.model_dump()}")


async def run_provider(p: llm.Provider) -> None:
    show(f"{p} call", await llm.generate_json_result(PROMPT, Answer, provider=p))
    show(f"{p} again", await llm.generate_json_result(PROMPT, Answer, provider=p))
    vecs = await llm.embed(["cabin baggage 7 kg", "pet fee"], task="query", provider=p)
    print(f"[{p} embed] {len(vecs)} vectors, dim={len(vecs[0])}")


async def run_fallback() -> None:
    """Point Gemini at a dead endpoint so the call fails as a network error."""
    from google import genai
    from google.genai import types

    llm._gemini_client = genai.Client(
        api_key="x", http_options=types.HttpOptions(base_url="http://127.0.0.1:9", timeout=2000)
    )
    r = await llm.generate_json_result(PROMPT + " (fallback test)", Answer, cache=False)
    show("fallback", r)
    print(f"    status: {llm.provider_status()}")


async def main(provider: str, fallback: bool) -> None:
    if fallback:
        await run_fallback()
        return
    for p in (["gemini", "ollama"] if provider == "both" else [provider]):
        try:
            await run_provider(p)  # type: ignore[arg-type]
        except llm.LLMError as e:
            print(f"[{p}] FAILED ({e.kind}): {e.message}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["gemini", "ollama", "both"], default="both")
    ap.add_argument("--fallback", action="store_true")
    a = ap.parse_args()
    asyncio.run(main(a.provider, a.fallback))
