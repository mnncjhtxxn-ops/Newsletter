"""Smoke tests.

- Feed parsing on a local RSS fixture (no network, no LLM).
- Template rendering with canned insights (no LLM).

These are deliberately small — they guard the wiring, not the model.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from techspark import draft
from techspark.models import (
    Insight,
    Issue,
    Ranking,
    Story,
    StoryInsight,
    TrendSpotlight,
)
from techspark.sources import _clean_summary, parse_since


FIXTURE = Path(__file__).parent / "fixtures" / "sample_feed.xml"


def test_parse_since_accepts_common_units():
    assert parse_since("48h").total_seconds() == 48 * 3600
    assert parse_since("30d").days == 30
    assert parse_since("2w").days == 14


def test_parse_since_rejects_nonsense():
    with pytest.raises(ValueError):
        parse_since("tomorrow")


def test_clean_summary_strips_tags_and_whitespace():
    raw = "<p>Hello   <b>world</b> there.</p>\n\n<p>Next.</p>"
    cleaned = _clean_summary(raw)
    assert "<" not in cleaned and ">" not in cleaned
    assert "Hello" in cleaned and "world" in cleaned and "Next." in cleaned
    assert "  " not in cleaned  # collapsed whitespace


def test_feed_fixture_parses_into_entries():
    """feedparser handles the fixture — guards the fetch path's parsing shape."""
    import feedparser

    parsed = feedparser.parse(FIXTURE.read_bytes())
    assert len(parsed.entries) == 3
    titles = {e.title for e in parsed.entries}
    assert "Ofgem consults on network resilience reforms" in titles


def _canned_story(idx: int, title: str, source: str = "Sample") -> Story:
    return Story(
        id=f"test{idx:03d}",
        title=title,
        url=f"https://example.com/story-{idx}",
        source=source,
        source_category="energy_utilities",
        published=datetime(2026, 4, 10 + idx, tzinfo=timezone.utc),
        summary="A short excerpt.",
    )


def _canned_story_insight(idx: int, title: str, category: str = "energy_utilities") -> StoryInsight:
    return StoryInsight(
        story=_canned_story(idx, title),
        ranking=Ranking(
            id=f"test{idx:03d}",
            score_0_10=9 - idx,
            category=category,  # type: ignore[arg-type]
            rationale="Directly material to UK utilities.",
        ),
        insight=Insight(
            summary="Something concrete happened, then another thing happened.",
            energy_utilities_angle="It changes how DNOs plan resilience.",
            org_angle="We'd feel this via RIIO and our network estate.",
            broader_angle="n/a",
            dry_line="Another bold pledge, though the last three were also bold.",
        ),
    )


def test_template_render_produces_required_sections(tmp_path: Path):
    issue = Issue(
        month="2026-04",
        tone="dry",
        editor_note="This month: grids, clouds, and the usual pledges.",
        sparks=[
            _canned_story_insight(1, "Ofgem consults on resilience"),
            _canned_story_insight(2, "Hyperscaler revises net-zero"),
            _canned_story_insight(3, "AI coding on call"),
        ],
        trends=[
            TrendSpotlight(
                title="Net-zero calendars slip",
                body="A cluster of vendors quietly pushed dates right.",
                dry_line="The future, slightly further away than last year.",
            )
        ],
        quick_hits=[_canned_story_insight(4, "Quick hit one")],
    )

    md_path, html_path = draft.render(issue, tmp_path)

    md = md_path.read_text(encoding="utf-8")
    html = html_path.read_text(encoding="utf-8")

    for section in ("# Tech Spark", "## Sparks", "## Current trends", "## Quick hits"):
        assert section in md, f"Missing section in MD: {section}"

    assert "Ofgem consults on resilience" in md
    assert "Another bold pledge" in md

    assert "<html" in html.lower()
    assert "Tech Spark" in html
    assert "Ofgem consults on resilience" in html
    assert "Net-zero calendars slip" in html


def test_template_omits_broader_when_na(tmp_path: Path):
    """Bigger picture section must not render when broader_angle == 'n/a'."""
    si = _canned_story_insight(1, "A story")
    assert si.insight.broader_angle == "n/a"
    issue = Issue(
        month="2026-04",
        tone="dry",
        editor_note="Note.",
        sparks=[si],
        trends=[],
        quick_hits=[],
    )
    md_path, _ = draft.render(issue, tmp_path)
    md = md_path.read_text(encoding="utf-8")
    assert "Bigger picture" not in md
