"""Final draft assembly + Jinja2 rendering."""

from __future__ import annotations

import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .config import load_prompt, repo_root
from .llm import MODEL_DRAFT, call_with_tool
from .models import InsightBatch, Issue, StoryInsight, Tone, TrendSpotlight

log = logging.getLogger(__name__)

_SPARKS_COUNT = 5
_QUICK_HITS_COUNT = 8
_MIN_CATEGORY_FOR_TREND = 4


def _draft_tool() -> dict[str, Any]:
    return {
        "name": "submit_draft",
        "description": "Submit editor note and trend spotlights for this issue.",
        "input_schema": {
            "type": "object",
            "properties": {
                "editor_note": {"type": "string"},
                "trends": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "body": {"type": "string"},
                            "dry_line": {"type": "string"},
                        },
                        "required": ["title", "body", "dry_line"],
                    },
                },
            },
            "required": ["editor_note", "trends"],
        },
    }


def _candidate_trend_categories(sparks: list[StoryInsight]) -> list[str]:
    counts = Counter(s.ranking.category for s in sparks)
    return [cat for cat, n in counts.most_common() if n >= _MIN_CATEGORY_FOR_TREND]


def _item_for_prompt(si: StoryInsight) -> dict[str, Any]:
    return {
        "id": si.story.id,
        "title": si.story.title,
        "source": si.story.source,
        "url": str(si.story.url),
        "category": si.ranking.category,
        "score": si.ranking.score_0_10,
        "summary": si.insight.summary,
        "energy_utilities_angle": si.insight.energy_utilities_angle,
        "org_angle": si.insight.org_angle,
        "broader_angle": si.insight.broader_angle,
        "dry_line": si.insight.dry_line,
    }


def _ask_for_editor_and_trends(
    sparks: list[StoryInsight],
    tone: Tone,
    month: str,
) -> tuple[str, list[TrendSpotlight]]:
    candidate_cats = _candidate_trend_categories(sparks)
    prompt = (
        load_prompt("draft").replace("{{ tone }}", tone)
        + f"\n\n## Month\n\n{month}\n"
        + f"\n## Candidate trend categories (>= {_MIN_CATEGORY_FOR_TREND} stories)\n\n"
        + (", ".join(candidate_cats) if candidate_cats else "(none — skip trends)")
        + "\n\n## Stories\n\n```json\n"
        + json.dumps([_item_for_prompt(s) for s in sparks], indent=2)
        + "\n```"
    )
    try:
        result = call_with_tool(
            model=MODEL_DRAFT,
            user_prompt=prompt,
            tool=_draft_tool(),
            max_tokens=4096,
        )
    except Exception as exc:  # noqa: BLE001
        log.error("Draft call failed, falling back to minimal assembly: %s", exc)
        return (
            f"Tech Spark — {month}. This issue's editor note could not be generated; please write one in.",
            [],
        )

    editor_note = result.get("editor_note", "").strip()
    trends = [TrendSpotlight(**t) for t in result.get("trends", [])]
    return editor_note, trends


def assemble(batch: InsightBatch, month: str) -> Issue:
    sorted_items = sorted(
        batch.items,
        key=lambda x: x.ranking.score_0_10,
        reverse=True,
    )
    sparks = sorted_items[:_SPARKS_COUNT]
    quick_hits = sorted_items[_SPARKS_COUNT : _SPARKS_COUNT + _QUICK_HITS_COUNT]

    editor_note, trends = _ask_for_editor_and_trends(sparks, batch.tone, month)

    return Issue(
        month=month,
        tone=batch.tone,
        editor_note=editor_note,
        sparks=sparks,
        trends=trends,
        quick_hits=quick_hits,
    )


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(repo_root() / "templates")),
        autoescape=select_autoescape(enabled_extensions=("html", "htm")),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render(issue: Issue, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    env = _env()

    md = env.get_template("newsletter.md.j2").render(issue=issue)
    html = env.get_template("newsletter.html.j2").render(issue=issue)

    md_path = out_dir / f"{issue.month}-techspark.md"
    html_path = out_dir / f"{issue.month}-techspark.html"
    md_path.write_text(md, encoding="utf-8")
    html_path.write_text(html, encoding="utf-8")
    return md_path, html_path
