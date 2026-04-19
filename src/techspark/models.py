"""Pydantic models for the Tech Spark pipeline.

Each stage of the pipeline (fetch → rank → insight → draft) writes a JSON
file of one of these models. The editor can hand-edit the JSON between
stages.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


Category = Literal[
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

SourceCategory = Literal[
    "digital_it",
    "energy_utilities",
    "uk_policy",
    "vendor_signal",
]

Tone = Literal["dry", "neutral", "playful"]


class Story(BaseModel):
    """A raw story pulled from an RSS feed."""

    id: str
    title: str
    url: HttpUrl
    source: str
    source_category: SourceCategory
    published: datetime | None = None
    summary: str = ""


class StoryBatch(BaseModel):
    fetched_at: datetime
    since: str
    stories: list[Story]


class Ranking(BaseModel):
    id: str
    score_0_10: int = Field(ge=0, le=10)
    category: Category
    rationale: str


class RankedStory(BaseModel):
    story: Story
    ranking: Ranking


class RankedBatch(BaseModel):
    ranked_at: datetime
    items: list[RankedStory]


class Insight(BaseModel):
    summary: str
    energy_utilities_angle: str
    org_angle: str
    broader_angle: str
    dry_line: str


class StoryInsight(BaseModel):
    story: Story
    ranking: Ranking
    insight: Insight


class InsightBatch(BaseModel):
    tone: Tone
    generated_at: datetime
    items: list[StoryInsight]


class TrendSpotlight(BaseModel):
    title: str
    body: str
    dry_line: str


class Issue(BaseModel):
    """The assembled newsletter, ready to render."""

    month: str
    tone: Tone
    editor_note: str
    sparks: list[StoryInsight]
    trends: list[TrendSpotlight]
    quick_hits: list[StoryInsight]
