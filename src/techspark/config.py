"""Configuration loading for Tech Spark."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, HttpUrl

from .models import SourceCategory


def repo_root() -> Path:
    """Locate the repo root by walking up from this file."""
    return Path(__file__).resolve().parent.parent.parent


class FeedSource(BaseModel):
    name: str
    url: HttpUrl
    category: SourceCategory


class SourcesConfig(BaseModel):
    feeds: list[FeedSource]


@lru_cache(maxsize=1)
def load_sources(path: Path | None = None) -> SourcesConfig:
    p = path or (repo_root() / "config" / "sources.yaml")
    data = yaml.safe_load(p.read_text(encoding="utf-8"))
    return SourcesConfig(**data)


@lru_cache(maxsize=1)
def load_org_context(path: Path | None = None) -> str:
    p = path or (repo_root() / "config" / "org_context.md")
    return p.read_text(encoding="utf-8")


@lru_cache(maxsize=8)
def load_prompt(name: str) -> str:
    p = repo_root() / "config" / "prompts" / f"{name}.md"
    return p.read_text(encoding="utf-8")


def _read_env_file(path: Path) -> None:
    """Minimal .env loader. Leaves existing env vars untouched."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_env() -> None:
    _read_env_file(repo_root() / ".env")


def anthropic_api_key() -> str:
    load_env()
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in."
        )
    return key
