"""Per-story insight + dry one-liner generation."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from .config import load_prompt
from .llm import MODEL_INSIGHT, call_with_tool
from .models import Insight, InsightBatch, RankedBatch, RankedStory, StoryInsight, Tone

log = logging.getLogger(__name__)


def _insight_tool() -> dict[str, Any]:
    return {
        "name": "submit_insight",
        "description": "Submit editorial insight and dry one-liner for a single story.",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "energy_utilities_angle": {"type": "string"},
                "org_angle": {"type": "string"},
                "broader_angle": {"type": "string"},
                "dry_line": {"type": "string"},
            },
            "required": [
                "summary",
                "energy_utilities_angle",
                "org_angle",
                "broader_angle",
                "dry_line",
            ],
        },
    }


def _build_prompt(rs: RankedStory, tone: Tone) -> str:
    base = load_prompt("insight").replace("{{ tone }}", tone)
    humour_ref = load_prompt("humour")
    story_json = {
        "id": rs.story.id,
        "title": rs.story.title,
        "source": rs.story.source,
        "source_category": rs.story.source_category,
        "published": rs.story.published.isoformat() if rs.story.published else None,
        "url": str(rs.story.url),
        "summary": rs.story.summary,
        "ranker_category": rs.ranking.category,
        "ranker_rationale": rs.ranking.rationale,
    }
    return (
        base
        + "\n\n## Tone reference (humour.md)\n\n"
        + humour_ref
        + "\n\n## Story\n\n```json\n"
        + json.dumps(story_json, indent=2)
        + "\n```"
    )


def _generate_one(rs: RankedStory, tone: Tone) -> Insight | None:
    try:
        result = call_with_tool(
            model=MODEL_INSIGHT,
            user_prompt=_build_prompt(rs, tone),
            tool=_insight_tool(),
            max_tokens=2048,
        )
        return Insight(**result)
    except Exception as exc:  # noqa: BLE001 - graceful degradation
        log.error("Insight generation failed for %s (%s): %s", rs.story.id, rs.story.title, exc)
        return None


def generate_insights(ranked: RankedBatch, tone: Tone) -> InsightBatch:
    items: list[StoryInsight] = []
    for i, rs in enumerate(ranked.items, start=1):
        log.info("Generating insight %d/%d: %s", i, len(ranked.items), rs.story.title)
        insight = _generate_one(rs, tone)
        if insight is None:
            continue
        items.append(StoryInsight(story=rs.story, ranking=rs.ranking, insight=insight))
    return InsightBatch(
        tone=tone,
        generated_at=datetime.now(timezone.utc),
        items=items,
    )
