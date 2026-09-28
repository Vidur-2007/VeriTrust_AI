"""The only path to any model: structured JSON generation and embeddings.

- Gemini (google-genai) or Ollama, chosen by LLM_PROVIDER.
- Output validated against a Pydantic schema, with one repair retry on parse failure.
- Exponential backoff on 429, honouring the server's retry delay.
- Automatic fallback to Ollama when Gemini is rate limited, unreachable or misconfigured.
- Disk cache keyed by a hash of provider, model, schema and prompt.
- Embeddings never fall back automatically: vectors from different models can't share a
  Chroma collection.
"""

import asyncio
import hashlib
import json
import logging
import re
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Generic, Literal, TypeVar

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

from app.config import get_settings

log = logging.getLogger("veritrust.llm")

T = TypeVar("T", bound=BaseModel)
Provider = Literal["gemini", "ollama"]
EmbedTask = Literal["document", "query"]
ErrorKind = Literal["rate_limit", "unavailable", "config", "invalid_output"]

MAX_429_RETRIES = 3
MAX_5XX_RETRIES = 2
MAX_WAIT_BEFORE_FALLBACK_S = 10.0
RATE_LIMIT_RECENT_S = 120.0
# Once we give up on Gemini (network error, overload, repeated 429s), stay on Ollama at least
# this long so each request doesn't pay for another failed attempt and the UI chip is stable.
GEMINI_COOLDOWN_S = 60.0
GEMINI_EMBED_BATCH = 100
OLLAMA_EMBED_BATCH = 32


class LLMError(Exception):
    """Raised to callers. `message` is safe to show in the UI."""

    def __init__(self, message: str, *, kind: ErrorKind, provider: Provider,
                 retry_after_s: float | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.provider = provider
        self.retry_after_s = retry_after_s


@dataclass
class LLMResult(Generic[T]):
    data: T
    provider: Provider
    model: str
    cached: bool
    ms: int


@dataclass
class _Status:
    last_provider: Provider | None = None
    fallback_reason: str | None = None
    last_rate_limit_at: float | None = None  # wall clock, for display
    gemini_cooldown_until: float = 0.0  # monotonic; skip Gemini until then


_status = _Status()


# ---------------------------------------------------------------- rate limiting

class RateLimiter:
    """Sliding one-minute window. Recreates its lock if the event loop changes (scripts)."""

    def __init__(self) -> None:
        self._times: deque[float] = deque()
        self._lock: asyncio.Lock | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _get_lock(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._lock is None or self._loop is not loop:
            self._lock, self._loop = asyncio.Lock(), loop
        return self._lock

    async def acquire(self) -> None:
        rpm = max(1, get_settings().llm_rpm)
        async with self._get_lock():
            while True:
                now = time.monotonic()
                while self._times and now - self._times[0] >= 60:
                    self._times.popleft()
                if len(self._times) < rpm:
                    self._times.append(now)
                    return
                await asyncio.sleep(60 - (now - self._times[0]) + 0.05)


_limiter = RateLimiter()


# ---------------------------------------------------------------- disk cache

def _hash(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_path(kind: str, key: str) -> Path:
    return get_settings().cache_dir / kind / key[:2] / f"{key}.json"


def _cache_get(kind: str, key: str) -> Any | None:
    path = _cache_path(kind, key)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _cache_put(kind: str, key: str, value: Any) -> None:
    path = _cache_path(kind, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------- helpers

_gemini_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _gemini_client
    s = get_settings()
    if not s.gemini_api_key.get_secret_value():
        raise LLMError("GEMINI_API_KEY is not set in .env.", kind="config", provider="gemini")
    if _gemini_client is None:
        _gemini_client = genai.Client(
            api_key=s.gemini_api_key.get_secret_value(),
            http_options=types.HttpOptions(timeout=int(s.gemini_timeout_s * 1000)),
        )
    return _gemini_client


def _model_for(provider: Provider) -> str:
    s = get_settings()
    return s.gemini_model if provider == "gemini" else s.ollama_model


def _embed_model_for(provider: Provider) -> str:
    s = get_settings()
    return s.gemini_embed_model if provider == "gemini" else s.ollama_embed_model


def _retry_delay_s(err: genai_errors.APIError) -> float | None:
    """Read RetryInfo.retryDelay ("37s") from a Gemini 429 body, if present."""
    details = err.details.get("error", {}).get("details", []) if isinstance(err.details, dict) else []
    for d in details:
        if isinstance(d, dict) and "retryDelay" in d:
            m = re.match(r"([\d.]+)s", str(d["retryDelay"]))
            if m:
                return float(m.group(1))
    return None


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    return m.group(1) if m else text


def _start_cooldown(seconds: float) -> None:
    _status.gemini_cooldown_until = max(_status.gemini_cooldown_until,
                                        time.monotonic() + seconds)


def _record_rate_limit(delay: float) -> None:
    _status.last_rate_limit_at = time.time()
    _start_cooldown(delay)


async def _with_gemini_retries(call: Any, what: str, allow_long_wait: bool) -> Any:
    """Run a Gemini coroutine factory with 429 backoff. Maps SDK errors to LLMError."""
    for attempt in range(MAX_429_RETRIES + 1):
        try:
            await _limiter.acquire()
            return await call()
        except genai_errors.APIError as e:
            if e.code == 429:
                delay = _retry_delay_s(e) or float(2 ** (attempt + 1))
                _record_rate_limit(delay)
                last = attempt == MAX_429_RETRIES
                if last or (not allow_long_wait and delay > MAX_WAIT_BEFORE_FALLBACK_S):
                    wait = max(delay, GEMINI_COOLDOWN_S)
                    _start_cooldown(wait)
                    raise LLMError(
                        f"Gemini rate limit reached. Retrying in {round(wait)} s.",
                        kind="rate_limit", provider="gemini", retry_after_s=wait,
                    ) from e
                log.warning("Gemini 429 on %s, retry %d in %.1fs", what, attempt + 1, delay)
                await asyncio.sleep(delay)
                continue
            if e.code >= 500:
                # 503 "high demand" spikes are usually brief: two quick retries, then fall back.
                if attempt < MAX_5XX_RETRIES:
                    log.warning("Gemini %d on %s, retry %d", e.code, what, attempt + 1)
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                _start_cooldown(GEMINI_COOLDOWN_S)
                raise LLMError(f"Gemini is overloaded or unavailable ({e.code}).",
                               kind="unavailable", provider="gemini") from e
            raise LLMError(f"Gemini rejected the request ({e.code}): {e.message}",
                           kind="config", provider="gemini") from e
        except (httpx.TransportError, asyncio.TimeoutError, OSError) as e:
            _start_cooldown(GEMINI_COOLDOWN_S)
            raise LLMError(f"Can't reach Gemini: {type(e).__name__}.", kind="unavailable",
                           provider="gemini") from e
    raise AssertionError("unreachable")


# ---------------------------------------------------------------- raw provider calls

async def _gemini_generate(prompt: str, schema: type[BaseModel], system: str | None,
                           temperature: float, allow_long_wait: bool) -> str:
    client = _gemini()
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json",
        response_json_schema=schema.model_json_schema(),
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    async def call() -> str:
        resp = await client.aio.models.generate_content(
            model=get_settings().gemini_model, contents=prompt, config=config
        )
        return resp.text or ""

    return await _with_gemini_retries(call, "generate", allow_long_wait)


async def _ollama_generate(prompt: str, schema: type[BaseModel], system: str | None,
                           temperature: float) -> str:
    s = get_settings()
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": prompt}
    ]
    body = {
        "model": s.ollama_model,
        "messages": messages,
        "stream": False,
        "format": schema.model_json_schema(),
        "options": {"temperature": temperature},
    }
    try:
        async with httpx.AsyncClient(timeout=s.ollama_timeout_s) as client:
            r = await client.post(f"{s.ollama_url}/api/chat", json=body)
    except httpx.HTTPError as e:
        raise LLMError(f"Can't reach Ollama at {s.ollama_url}: {type(e).__name__}.",
                       kind="unavailable", provider="ollama") from e
    if r.status_code != 200:
        raise LLMError(f"Ollama error {r.status_code}: {r.text[:200]}",
                       kind="unavailable", provider="ollama")
    return r.json().get("message", {}).get("content", "")


async def _generate_validated(provider: Provider, prompt: str, schema: type[T],
                              system: str | None, temperature: float,
                              allow_long_wait: bool) -> T:
    """Call a provider, validate, and retry once with the validation error on failure."""
    attempt_prompt = prompt
    for attempt in range(2):
        if provider == "gemini":
            text = await _gemini_generate(attempt_prompt, schema, system, temperature,
                                          allow_long_wait)
        else:
            text = await _ollama_generate(attempt_prompt, schema, system, temperature)
        try:
            return schema.model_validate_json(_strip_fences(text))
        except ValidationError as e:
            if attempt == 1:
                raise LLMError(f"{provider} returned invalid JSON twice for {schema.__name__}.",
                               kind="invalid_output", provider=provider) from e
            log.warning("Invalid JSON from %s, retrying with error feedback", provider)
            attempt_prompt = (
                f"{prompt}\n\nYour previous reply was not valid JSON for the required schema.\n"
                f"Validation error: {str(e)[:600]}\nReply again with only valid JSON."
            )
    raise AssertionError("unreachable")


# ---------------------------------------------------------------- public API

def _provider_order(forced: Provider | None) -> list[Provider]:
    if forced:
        return [forced]
    s = get_settings()
    primary: Provider = s.llm_provider
    if primary == "ollama" or not s.llm_fallback:
        return [primary]
    if time.monotonic() < _status.gemini_cooldown_until:
        return ["ollama"]  # Gemini failed recently: don't wait for it again, go local
    return ["gemini", "ollama"]


async def generate_json_result(
    prompt: str,
    schema: type[T],
    *,
    system: str | None = None,
    temperature: float = 0.2,
    cache: bool = True,
    provider: Provider | None = None,
    allow_long_wait: bool = False,
) -> LLMResult[T]:
    """Generate an object of `schema`. `provider` forces one provider with no fallback.

    `allow_long_wait=True` (batch jobs) waits out long 429 delays instead of falling back.
    """
    order = _provider_order(provider)
    keys = {
        p: _hash(p, _model_for(p), schema.__name__, schema.model_json_schema(), system, prompt,
                 temperature)
        for p in (order if provider else ["gemini", "ollama"])
    }
    if cache:  # any provider's cached answer is fine, so warmed demos survive outages
        for p, key in keys.items():
            hit = _cache_get("llm", key)
            if hit is not None:
                try:
                    return LLMResult(schema.model_validate(hit), p, _model_for(p), True, 0)
                except ValidationError:
                    pass

    errors: list[LLMError] = []
    for p in order:
        t0 = time.perf_counter()
        try:
            data = await _generate_validated(p, prompt, schema, system, temperature,
                                             allow_long_wait)
        except LLMError as e:
            errors.append(e)
            if e.kind == "invalid_output":
                raise
            log.warning("%s failed (%s): %s", p, e.kind, e.message)
            continue
        ms = round((time.perf_counter() - t0) * 1000)
        if not provider:  # forced calls (smoke tests) don't change the reported status
            _status.last_provider = p
            if errors:
                _status.fallback_reason = f"{errors[0].kind}: {errors[0].message}"
            elif p == get_settings().llm_provider:
                _status.fallback_reason = None
            # else: skipped Gemini during its cooldown; keep the reason from when it failed
        if cache:
            _cache_put("llm", keys[p], data.model_dump(mode="json"))
        return LLMResult(data, p, _model_for(p), False, ms)

    first = errors[0]
    if len(errors) > 1:
        first.message = f"{first.message} Fallback also failed: {errors[-1].message}"
    raise first


async def generate_json(prompt: str, schema: type[T], **kwargs: Any) -> T:
    return (await generate_json_result(prompt, schema, **kwargs)).data


def embed_identity(provider: Provider | None = None) -> tuple[Provider, str]:
    p: Provider = provider or get_settings().llm_provider
    return p, _embed_model_for(p)


async def _gemini_embed(texts: list[str], task: EmbedTask) -> list[list[float]]:
    client = _gemini()
    config = types.EmbedContentConfig(
        task_type="RETRIEVAL_DOCUMENT" if task == "document" else "RETRIEVAL_QUERY"
    )

    # One Content per text: gemini-embedding-2 merges a plain list[str] into ONE multimodal vector.
    contents = [types.Content(parts=[types.Part(text=t)]) for t in texts]

    async def call() -> list[list[float]]:
        resp = await client.aio.models.embed_content(
            model=get_settings().gemini_embed_model, contents=contents, config=config
        )
        return [list(e.values or []) for e in resp.embeddings or []]

    return await _with_gemini_retries(call, "embed", allow_long_wait=True)


async def _ollama_embed(texts: list[str], task: EmbedTask) -> list[list[float]]:
    s = get_settings()
    prefix = "search_document: " if task == "document" else "search_query: "  # nomic convention
    try:
        async with httpx.AsyncClient(timeout=s.ollama_timeout_s) as client:
            r = await client.post(f"{s.ollama_url}/api/embed",
                                  json={"model": s.ollama_embed_model,
                                        "input": [prefix + t for t in texts]})
    except httpx.HTTPError as e:
        raise LLMError(f"Can't reach Ollama at {s.ollama_url}.", kind="unavailable",
                       provider="ollama") from e
    if r.status_code != 200:
        raise LLMError(f"Ollama embed error {r.status_code}: {r.text[:200]}",
                       kind="unavailable", provider="ollama")
    return r.json()["embeddings"]


async def embed(texts: list[str], *, task: EmbedTask = "document",
                provider: Provider | None = None) -> list[list[float]]:
    """Embed texts with the configured (or given) provider. Cached per text."""
    p, model = embed_identity(provider)
    keys = [_hash("embed", p, model, task, t) for t in texts]
    out: list[list[float] | None] = [_cache_get("embed", k) for k in keys]
    missing = [i for i, v in enumerate(out) if v is None]
    batch_size = GEMINI_EMBED_BATCH if p == "gemini" else OLLAMA_EMBED_BATCH
    fn = _gemini_embed if p == "gemini" else _ollama_embed
    for start in range(0, len(missing), batch_size):
        idx = missing[start:start + batch_size]
        vectors = await fn([texts[i] for i in idx], task)
        if len(vectors) != len(idx):
            raise LLMError(f"{p} returned {len(vectors)} embeddings for {len(idx)} texts.",
                           kind="invalid_output", provider=p)
        for i, v in zip(idx, vectors):
            out[i] = v
            _cache_put("embed", keys[i], v)
    return [v for v in out if v is not None]


async def ollama_reachable(timeout: float = 1.0) -> bool:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(f"{get_settings().ollama_url}/api/tags")
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def provider_status() -> dict[str, Any]:
    """What the UI needs for the provider chip. `running_locally` drives "Running locally"."""
    s = get_settings()
    now = time.time()
    cooldown_s = max(0.0, _status.gemini_cooldown_until - time.monotonic())
    active: Provider = (
        "ollama" if s.llm_provider == "gemini" and s.llm_fallback and cooldown_s > 0
        else _status.last_provider or s.llm_provider
    )
    recent = (_status.last_rate_limit_at is not None
              and now - _status.last_rate_limit_at < RATE_LIMIT_RECENT_S)
    return {
        "configured": s.llm_provider,
        "active": active,
        "running_locally": active == "ollama",
        "active_model": _model_for(active),
        "gemini_retry_in_s": round(cooldown_s) if active == "ollama" else 0,
        "fallback_enabled": s.llm_fallback,
        "fallback_reason": _status.fallback_reason,
        "rate_limited_recently": recent,
        "last_rate_limit_at": (time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                             time.gmtime(_status.last_rate_limit_at))
                               if _status.last_rate_limit_at else None),
    }
