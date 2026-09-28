"""Environment settings. Reads <repo>/.env regardless of the current working directory."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
DATA_SOURCE_DIR = REPO_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = ""
    # Comma-separated models tried in order when the primary is overloaded or out of quota.
    gemini_model_fallbacks: str = ""
    # minimal | low | medium | high | off. Dropped automatically for models that reject it.
    gemini_thinking: str = "minimal"
    gemini_embed_model: str = ""
    gemini_timeout_s: float = 30.0

    llm_provider: Literal["gemini", "ollama"] = "gemini"
    llm_fallback: bool = True
    llm_rpm: int = 10
    embed_rpm: int = 60

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "gemma3:4b"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_timeout_s: float = 300.0

    data_dir: Path = BACKEND_DIR / "var"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @field_validator("data_dir", mode="before")
    @classmethod
    def _blank_data_dir(cls, v: object) -> object:
        return BACKEND_DIR / "var" if v in (None, "") else v

    @property
    def db_path(self) -> Path:
        return self.data_dir / "veritrust.sqlite3"

    @property
    def chroma_dir(self) -> Path:
        return self.data_dir / "chroma"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    return s
