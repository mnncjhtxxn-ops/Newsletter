"""Rank fetched stories via batched Claude tool-use calls."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from .config import load_prompt
from .llm import MODEL_RANK, call_with_tool
from .models import Ranking, RankedBatch, RankedStory, Story, StoryBatch

log = logging.getLogger(__name__)


_BATCH_SIZE = 20
_VALID_CATEGORIES = [
    "energy_utilities",
    "ai_ml",
    "cloud_infra",
    "cyber",
    "data_platform",
    "regulation_policy",
    "customer_retail",
    "ot_industrial",
    "broader_tech",
]


def _rank_tool() -> dict[str, Any]:
    return {
        "name": "submit_rankings",
        "description": "Submit relevance rankings for every story in the batch.",
        "input_schema": {
            "type": "object",
            "properties": {
                "rankings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "score_0_10": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 10,
                            },
                            "category": {
                                "type": "string",
                                "enum": _VALID_CATEGORIES,
                            },
                            "rationale": {"type": "string"},
                        },
                        "required": ["id", "score_0_10", "category", "rationale"],
                    },
                }
            },
            "required": ["rankings"],
        },
    }


def _story_as_json(story: Story) -> dict[str, Any]:
    return {
        "id": story.id,
        "title": story.title,
        "source": story.source,
        "source_category": story.source_category,
        "published": story.published.isoformat() if story.published else None,
        "summary": story.summary,
    }


def _rank_batch(stories: list[Story]) -> list[Ranking]:
    prompt = (
        load_prompt("rank")
        + "\n\n## Batch\n\n```json\n"
        + json.dumps([_story_as_json(s) for s in stories], indent=2)
        + "\n```"
    )
    result = call_with_tool(
        model=MODEL_RANK,
        user_prompt=prompt,
        tool=_rank_tool(),
        max_tokens=4096,
    )
    rankings = result.get("rankings", [])
    out: list[Ranking] = []
    for entry in rankings:
        try:
            out.append(Ranking(**entry))
        except Exception as exc:  # noqa: BLE001
            log.warning("Dropping malformed ranking entry %r: %s", entry, exc)
    return out


def rank(batch: StoryBatch, top: int) -> RankedBatch:
    """Rank all stories in `batch` and return the top-N highest scoring."""
    by_id: dict[str, Story] = {s.id: s for s in batch.stories}
    all_rankings: dict[str, Ranking] = {}

    chunks = [
        batch.stories[i : i + _BATCH_SIZE]
        for i in range(0, len(batch.stories), _BATCH_SIZE)
    ]
    log.info("Ranking %d stories in %d batches of <=%d", len(batch.stories), len(chunks), _BATCH_SIZE)

    for i, chunk in enumerate(chunks, start=1):
        log.info("Ranking batch %d/%d (%d stories)", i, len(chunks), len(chunk))
        try:
            for r in _rank_batch(chunk):
                if r.id in by_id:
                    all_rankings[r.id] = r
        except Exception as exc:  # noqa: BLE001
            log.error("Batch %d failed, skipping: %s", i, exc)
            continue

    ranked = [
        RankedStory(story=by_id[rid], ranking=r)
        for rid, r in all_rankings.items()
    ]
    ranked.sort(key=lambda x: x.ranking.score_0_10, reverse=True)
    return RankedBatch(
        ranked_at=datetime.now(timezone.utc),
        items=ranked[:top],
    )
