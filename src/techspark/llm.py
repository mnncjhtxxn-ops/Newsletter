"""Anthropic SDK wrapper for Tech Spark.

Encapsulates:

- Client construction using ANTHROPIC_API_KEY from env/.env.
- The cached system-prompt pattern (`org_context.md` as a stable prefix).
- Adaptive thinking on Opus 4.7 (required; `budget_tokens`/temperature removed).
- Simple retry with exponential backoff on transient errors.
- Structured output via tool-use — we define one tool and bind its result.

Models used by the pipeline:

- `claude-sonnet-4-6` for batched ranking (cheaper, many stories per call).
- `claude-opus-4-7` for per-story insight and final draft (voice quality).
"""

from __future__ import annotations

import logging
import time
from typing import Any

import anthropic

from .config import anthropic_api_key, load_org_context

log = logging.getLogger(__name__)

MODEL_RANK = "claude-sonnet-4-6"
MODEL_INSIGHT = "claude-opus-4-7"
MODEL_DRAFT = "claude-opus-4-7"

_MAX_RETRIES = 3
_INITIAL_BACKOFF = 2.0


def client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=anthropic_api_key())


def _system_blocks() -> list[dict[str, Any]]:
    """System prompt with ephemeral cache on the org-context block.

    The org context is stable across every call in a run; caching it once
    pays for itself after the first hit.
    """
    return [
        {
            "type": "text",
            "text": load_org_context(),
            "cache_control": {"type": "ephemeral"},
        }
    ]


def _model_kwargs(model: str) -> dict[str, Any]:
    """Per-model kwargs. Opus 4.7 requires adaptive thinking, forbids sampling params."""
    kwargs: dict[str, Any] = {}
    if model.startswith("claude-opus-4-7"):
        kwargs["thinking"] = {"type": "adaptive"}
    return kwargs


def call_with_tool(
    *,
    model: str,
    user_prompt: str,
    tool: dict[str, Any],
    max_tokens: int = 4096,
) -> dict[str, Any]:
    """Single call that forces the model to use a named tool and returns its input.

    Raises RuntimeError if the model declines to call the tool.
    """
    tool_name = tool["name"]
    last_exc: Exception | None = None
    backoff = _INITIAL_BACKOFF
    c = client()

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            resp = c.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=_system_blocks(),
                tools=[tool],
                tool_choice={"type": "tool", "name": tool_name},
                messages=[{"role": "user", "content": user_prompt}],
                **_model_kwargs(model),
            )
            for block in resp.content:
                if getattr(block, "type", None) == "tool_use" and block.name == tool_name:
                    return dict(block.input)
            raise RuntimeError(f"Model did not invoke expected tool {tool_name!r}")

        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as exc:
            last_exc = exc
            if attempt == _MAX_RETRIES:
                break
            log.warning(
                "LLM call failed (attempt %d/%d): %s — retrying in %.1fs",
                attempt, _MAX_RETRIES, exc, backoff,
            )
            time.sleep(backoff)
            backoff *= 2

    assert last_exc is not None
    raise last_exc
