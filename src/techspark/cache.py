"""Simple JSON-on-disk cache keyed by a stable hash.

Used to avoid re-fetching feeds and re-calling the LLM during a run when an
editor iterates on later stages. The cache is not clever — it is a
content-addressed key/value store under `.cache/`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .config import repo_root


def _cache_dir() -> Path:
    p = repo_root() / ".cache"
    p.mkdir(parents=True, exist_ok=True)
    return p


def key(*parts: str) -> str:
    h = hashlib.sha256()
    for part in parts:
        h.update(part.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:16]


def get(namespace: str, k: str) -> Any | None:
    path = _cache_dir() / namespace / f"{k}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def put(namespace: str, k: str, value: Any) -> None:
    ns_dir = _cache_dir() / namespace
    ns_dir.mkdir(parents=True, exist_ok=True)
    (ns_dir / f"{k}.json").write_text(
        json.dumps(value, default=str, indent=2), encoding="utf-8"
    )
