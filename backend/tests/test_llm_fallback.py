"""Fallback rules in llm.py, tested offline with fake providers (no API calls)."""

import asyncio
from typing import Any

import pytest
from google.genai import errors
from pydantic import BaseModel

from app import llm
from app.config import get_settings


class Out(BaseModel):
    answer: str


@pytest.fixture(autouse=True)
def isolate(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """Fresh status, no rate limiter, instant sleeps, Gemini primary with fallback on."""
    monkeypatch.setattr(llm, "_status", llm._Status())
    monkeypatch.setattr(llm._limiter, "acquire", _noop)
    monkeypatch.setattr(llm.asyncio, "sleep", _noop)
    s = get_settings()
    monkeypatch.setattr(s, "llm_provider", "gemini")
    monkeypatch.setattr(s, "llm_fallback", True)
    calls = {"gemini": 0, "ollama": 0}

    async def ollama(*_: Any) -> str:
        calls["ollama"] += 1
        return '{"answer": "local"}'

    monkeypatch.setattr(llm, "_ollama_generate", ollama)
    return calls


async def _noop(*_: Any, **__: Any) -> None:
    return None


def _gemini_returns(monkeypatch: pytest.MonkeyPatch, calls: dict[str, int],
                    error: llm.LLMError | None) -> None:
    async def gemini(*_: Any) -> str:
        calls["gemini"] += 1
        if error:
            raise error
        return '{"answer": "cloud"}'

    monkeypatch.setattr(llm, "_gemini_generate", gemini)


def run(prompt: str = "q") -> llm.LLMResult[Out]:
    return asyncio.run(llm.generate_json_result(prompt, Out, cache=False))


def test_gemini_healthy_stays_on_gemini(monkeypatch: pytest.MonkeyPatch, isolate: dict) -> None:
    _gemini_returns(monkeypatch, isolate, None)
    assert run().provider == "gemini"
    assert llm.provider_status()["running_locally"] is False


def test_network_error_falls_back_and_cools_down(monkeypatch: pytest.MonkeyPatch,
                                                 isolate: dict) -> None:
    async def gemini(*_: Any) -> str:
        isolate["gemini"] += 1
        llm._start_cooldown(llm.GEMINI_COOLDOWN_S)  # what _with_gemini_retries does
        raise llm.LLMError("Can't reach Gemini", kind="unavailable", provider="gemini")

    monkeypatch.setattr(llm, "_gemini_generate", gemini)
    r = run("a")
    assert (r.provider, r.data.answer) == ("ollama", "local")
    st = llm.provider_status()
    assert st["running_locally"] is True and "unavailable" in st["fallback_reason"]
    assert st["gemini_retry_in_s"] > 0
    run("b")  # during cooldown Gemini is skipped entirely
    assert isolate == {"gemini": 1, "ollama": 2}


def test_fallback_disabled_raises(monkeypatch: pytest.MonkeyPatch, isolate: dict) -> None:
    monkeypatch.setattr(get_settings(), "llm_fallback", False)
    _gemini_returns(monkeypatch, isolate,
                    llm.LLMError("down", kind="unavailable", provider="gemini"))
    with pytest.raises(llm.LLMError):
        run()
    assert isolate["ollama"] == 0


def _raise_429(delay: str) -> Any:
    n = {"calls": 0}

    async def call() -> None:
        n["calls"] += 1
        raise errors.APIError(429, {"error": {"code": 429, "details": [{"retryDelay": delay}]}})

    return call, n


def test_repeated_short_429s_retry_then_give_up() -> None:
    call, n = _raise_429("1s")
    with pytest.raises(llm.LLMError) as e:
        asyncio.run(llm._with_gemini_retries(call, "t", allow_long_wait=False))
    assert e.value.kind == "rate_limit"
    assert n["calls"] == llm.MAX_429_RETRIES + 1
    st = llm.provider_status()
    assert st["rate_limited_recently"] is True
    assert st["running_locally"] is True and st["gemini_retry_in_s"] >= 59  # not just 1 s


def test_long_429_delay_falls_back_immediately() -> None:
    call, n = _raise_429("45s")  # typical free-tier delay: not worth waiting in a live chat
    with pytest.raises(llm.LLMError):
        asyncio.run(llm._with_gemini_retries(call, "t", allow_long_wait=False))
    assert n["calls"] == 1


def test_batch_jobs_wait_out_long_429s() -> None:
    call, n = _raise_429("45s")
    with pytest.raises(llm.LLMError):
        asyncio.run(llm._with_gemini_retries(call, "t", allow_long_wait=True))
    assert n["calls"] == llm.MAX_429_RETRIES + 1
