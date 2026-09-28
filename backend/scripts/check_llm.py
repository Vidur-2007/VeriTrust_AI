"""Smoke test for app/llm.py: one structured call per provider, a cache hit, and embeddings.

Usage (from backend/):
  python scripts/check_llm.py --provider both [--fresh]   # --fresh skips the cache for call 1
  python scripts/check_llm.py --fallback network   # Gemini unreachable -> Ollama answers
  python scripts/check_llm.py --fallback 429       # Gemini keeps rate limiting -> Ollama answers
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


async def run_provider(p: llm.Provider, fresh: bool) -> None:
    show(f"{p} call", await llm.generate_json_result(PROMPT, Answer, provider=p, cache=not fresh))
    show(f"{p} again", await llm.generate_json_result(PROMPT, Answer, provider=p))
    vecs = await llm.embed(["cabin baggage 7 kg", "pet fee"], task="query", provider=p)
    print(f"[{p} embed] {len(vecs)} vectors, dim={len(vecs[0])}")


async def run_fallback(mode: str) -> None:
    """Break Gemini on purpose, then show the call served by Ollama and the chip status."""
    from google import genai
    from google.genai import errors, types

    if mode == "network":  # dead endpoint -> connection error
        llm._gemini_client = genai.Client(
            api_key="x", http_options=types.HttpOptions(base_url="http://127.0.0.1:9", timeout=2000)
        )
    else:  # every Gemini call returns 429 with a short server retry delay
        attempts = 0

        async def always_429(**_: object) -> None:
            nonlocal attempts
            attempts += 1
            print(f"    gemini attempt {attempts}: 429")
            raise errors.APIError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED",
                                                  "message": "quota", "details": [
                                                      {"retryDelay": "1s"}]}})

        client = llm._gemini()
        client.aio.models.generate_content = always_429  # type: ignore[method-assign]

    print(f"before: running_locally={llm.provider_status()['running_locally']}")
    r = await llm.generate_json_result(PROMPT + f" (fallback test: {mode})", Answer, cache=False)
    show(f"fallback {mode}", r)
    st = llm.provider_status()
    print(f"after:  running_locally={st['running_locally']} active={st['active']} "
          f"model={st['active_model']} gemini_retry_in_s={st['gemini_retry_in_s']}")
    print(f"        reason: {st['fallback_reason']}")
    r2 = await llm.generate_json_result(PROMPT + f" (second call: {mode})", Answer, cache=False)
    print(f"next call during cooldown -> provider={r2.provider} ms={r2.ms}")


async def main(provider: str, fallback: str | None, fresh: bool) -> None:
    if fallback:
        await run_fallback(fallback)
        return
    for p in (["gemini", "ollama"] if provider == "both" else [provider]):
        try:
            await run_provider(p, fresh)  # type: ignore[arg-type]
        except llm.LLMError as e:
            print(f"[{p}] FAILED ({e.kind}): {e.message}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["gemini", "ollama", "both"], default="both")
    ap.add_argument("--fallback", choices=["network", "429"])
    ap.add_argument("--fresh", action="store_true", help="bypass the cache for the first call")
    a = ap.parse_args()
    asyncio.run(main(a.provider, a.fallback, a.fresh))
