"""Gemini model chain in llm.py, tested offline with a scripted fake client (no API calls)."""

import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import errors
from pydantic import BaseModel

from app import llm
from app.config import get_settings


class Out(BaseModel):
    answer: str


def api_error(code: int, message: str = "", quota_id: str | None = None,
              retry: str | None = None) -> errors.APIError:
    details: list[dict[str, Any]] = []
    if quota_id:
        details.append({"@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [{"quotaId": quota_id}]})
    if retry:
        details.append({"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": retry})
    return errors.APIError(code, {"error": {"code": code, "message": message, "details": details}})


OVERLOADED = api_error(503, "This model is currently experiencing high demand.")
DAILY_QUOTA = api_error(429, "You exceeded your current quota",
                        "GenerateRequestsPerDayPerProjectPerModel-FreeTier", "16s")
MINUTE_QUOTA = api_error(429, "quota", "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "2s")


class FakeGemini:
    """Each model plays its script of outcomes in order; the last outcome repeats."""

    def __init__(self, script: dict[str, list[Any]]) -> None:
        self.script = script
        self.calls: list[str] = []
        self.configs: list[Any] = []
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    async def _generate(self, *, model: str, contents: str, config: Any) -> Any:
        self.calls.append(model)
        self.configs.append(config)
        outcomes = self.script[model]
        outcome = outcomes.pop(0) if len(outcomes) > 1 else outcomes[0]
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=f'{{"answer": "{outcome}"}}')


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    s = get_settings()
    for name, value in {"data_dir": tmp_path, "llm_provider": "gemini", "llm_fallback": True,
                        "gemini_model": "m1", "gemini_model_fallbacks": "m2, m3",
                        "gemini_thinking": "minimal"}.items():
        monkeypatch.setattr(s, name, value)
    monkeypatch.setattr(llm, "_status", llm._Status())
    monkeypatch.setattr(llm, "_models", None)
    monkeypatch.setattr(llm, "_model_limiters", {})
    monkeypatch.setattr(llm, "_no_thinking", set())
    monkeypatch.setattr(llm.RateLimiter, "acquire", _noop)
    monkeypatch.setattr(llm.asyncio, "sleep", _noop)
    calls = {"ollama": 0}

    async def ollama(*_: Any) -> str:
        calls["ollama"] += 1
        return '{"answer": "local"}'

    monkeypatch.setattr(llm, "_ollama_generate", ollama)
    return calls


async def _noop(*_: Any, **__: Any) -> None:
    return None


def use(monkeypatch: pytest.MonkeyPatch, script: dict[str, list[Any]]) -> FakeGemini:
    fake = FakeGemini(script)
    monkeypatch.setattr(llm, "_gemini", lambda: fake)
    return fake


def run(prompt: str = "q", cache: bool = False) -> llm.LLMResult[Out]:
    return asyncio.run(llm.generate_json_result(prompt, Out, cache=cache))


def test_overloaded_model_is_skipped_for_the_next(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use(monkeypatch, {"m1": [OVERLOADED], "m2": ["from m2"], "m3": ["from m3"]})
    r = run("a")
    assert (r.provider, r.model, r.data.answer) == ("gemini", "m2", "from m2")
    assert fake.calls == ["m1", "m2"]  # no retry sleeps on m1: the chain moved on at once

    run("b")  # m1 is cooling down, so it isn't even tried
    assert fake.calls == ["m1", "m2", "m2"]
    status = {m["model"]: m for m in llm.provider_status()["gemini_models"]}
    assert status["m1"]["retry_in_s"] > 0 and "overloaded" in status["m1"]["reason"]
    assert llm.provider_status()["active_model"] == "m2"


def test_daily_quota_is_remembered_across_restarts(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use(monkeypatch, {"m1": [DAILY_QUOTA], "m2": ["ok"], "m3": ["ok"]})
    assert run("a").model == "m2"
    assert llm._model_wait_s("m1") > 3000

    monkeypatch.setattr(llm, "_models", None)  # simulate a new process reading the file
    assert llm._model_wait_s("m1") > 3000
    run("b")
    assert fake.calls.count("m1") == 1


def test_all_models_down_falls_back_to_ollama(monkeypatch: pytest.MonkeyPatch,
                                              isolate: dict[str, int]) -> None:
    fake = use(monkeypatch, {"m1": [OVERLOADED], "m2": [OVERLOADED], "m3": [OVERLOADED]})
    r = run("a")
    assert (r.provider, r.data.answer) == ("ollama", "local")
    # Only the last model in the chain gets retries before giving up.
    assert fake.calls == ["m1", "m2"] + ["m3"] * (llm.MAX_5XX_RETRIES + 1)
    st = llm.provider_status()
    assert st["running_locally"] and "All Gemini models" in st["fallback_reason"]

    n = len(fake.calls)
    run("b")  # every model is cooling, so Gemini is skipped without a call
    assert len(fake.calls) == n and isolate["ollama"] == 2


def test_short_minute_quota_on_last_model_is_waited_out(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "gemini_model_fallbacks", "")
    fake = use(monkeypatch, {"m1": [MINUTE_QUOTA, "after wait"]})
    r = run()
    assert (r.model, r.data.answer) == ("m1", "after wait")
    assert fake.calls == ["m1", "m1"]


def test_thinking_rejected_retries_plain(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use(monkeypatch, {"m1": [api_error(400, "Thinking level is not supported"), "plain"],
                             "m2": ["x"], "m3": ["x"]})
    r = run()
    assert (r.model, r.data.answer) == ("m1", "plain")
    assert fake.configs[0].thinking_config is not None
    assert fake.configs[1].thinking_config is None
    assert "m1" in llm._no_thinking


def test_unknown_model_is_parked(monkeypatch: pytest.MonkeyPatch) -> None:
    use(monkeypatch, {"m1": [api_error(404, "models/m1 is not found")], "m2": ["ok"], "m3": ["ok"]})
    assert run().model == "m2"
    assert llm._model_wait_s("m1") > 3000


def test_cached_answer_from_any_model_is_reused(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = use(monkeypatch, {"m1": [OVERLOADED, "fresh m1"], "m2": ["from m2"], "m3": ["x"]})
    assert run("same", cache=True).model == "m2"
    monkeypatch.setattr(llm, "_models", {})  # m1 recovers
    r = run("same", cache=True)
    assert (r.cached, r.model, r.data.answer) == (True, "m2", "from m2")
    assert fake.calls == ["m1", "m2"]


def test_repeated_overload_backs_off_and_success_resets(monkeypatch: pytest.MonkeyPatch) -> None:
    use(monkeypatch, {"m1": [OVERLOADED], "m2": ["ok"], "m3": ["ok"]})
    run("a")
    first = llm._model_wait_s("m1")
    llm._model_states()["m1"].until = 0  # cooldown expires, m1 is probed again and fails again
    run("b")
    assert llm._model_wait_s("m1") > first * 1.5  # 30 s -> 60 s

    fake = use(monkeypatch, {"m1": ["back"], "m2": ["ok"], "m3": ["ok"]})
    llm._model_states()["m1"].until = 0
    assert run("c").model == "m1"
    assert "m1" not in llm._model_states() and fake.calls == ["m1"]
