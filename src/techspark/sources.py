"""RSS feed fetch, parse, dedupe, and date-windowing."""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import feedparser
import httpx

from .config import FeedSource, load_sources
from .models import Story, StoryBatch

log = logging.getLogger(__name__)


_SINCE_RE = re.compile(r"^\s*(\d+)\s*([dwh])\s*$", re.IGNORECASE)


def parse_since(expr: str) -> timedelta:
    """Parse '30d', '2w', '48h' style expressions."""
    m = _SINCE_RE.match(expr)
    if not m:
        raise ValueError(f"Invalid --since expression: {expr!r} (use e.g. 30d, 2w, 48h)")
    n = int(m.group(1))
    unit = m.group(2).lower()
    if unit == "h":
        return timedelta(hours=n)
    if unit == "d":
        return timedelta(days=n)
    return timedelta(weeks=n)


def _story_id(url: str, title: str) -> str:
    h = hashlib.sha256()
    h.update(url.encode("utf-8"))
    h.update(b"\x00")
    h.update(title.encode("utf-8"))
    return h.hexdigest()[:12]


def _parse_entry_date(entry) -> datetime | None:
    # feedparser populates `published_parsed` and `updated_parsed` as
    # time.struct_time tuples. Fall back to string parsing if needed.
    for attr in ("published_parsed", "updated_parsed"):
        value = getattr(entry, attr, None)
        if value:
            try:
                return datetime(*value[:6], tzinfo=timezone.utc)
            except (TypeError, ValueError):
                continue
    for attr in ("published", "updated"):
        raw = getattr(entry, attr, None)
        if raw:
            try:
                dt = parsedate_to_datetime(raw)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except (TypeError, ValueError):
                continue
    return None


def _clean_summary(raw: str) -> str:
    # Strip basic HTML tags without pulling in a parser dep.
    text = re.sub(r"<[^>]+>", " ", raw or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:600]


def _fetch_one(
    client: httpx.Client,
    feed: FeedSource,
    cutoff: datetime,
) -> list[Story]:
    try:
        resp = client.get(str(feed.url), timeout=20.0, follow_redirects=True)
        resp.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        log.warning("Feed failed: %s (%s): %s", feed.name, feed.url, exc)
        return []

    parsed = feedparser.parse(resp.content)
    if getattr(parsed, "bozo", 0) and not parsed.entries:
        log.warning("Feed returned no entries: %s", feed.name)
        return []

    stories: list[Story] = []
    for entry in parsed.entries:
        url = getattr(entry, "link", None)
        title = getattr(entry, "title", None)
        if not url or not title:
            continue

        published = _parse_entry_date(entry)
        if published and published < cutoff:
            continue

        summary = _clean_summary(
            getattr(entry, "summary", None) or getattr(entry, "description", "") or ""
        )

        try:
            stories.append(
                Story(
                    id=_story_id(url, title),
                    title=title.strip(),
                    url=url,
                    source=feed.name,
                    source_category=feed.category,
                    published=published,
                    summary=summary,
                )
            )
        except Exception as exc:  # noqa: BLE001 - skip malformed, keep going
            log.debug("Skipping malformed entry from %s: %s", feed.name, exc)
            continue

    log.info("Fetched %d entries from %s", len(stories), feed.name)
    return stories


def fetch_all(since: str) -> StoryBatch:
    """Fetch every configured feed and return a deduped batch.

    A feed failing logs a warning and is skipped — one bad feed must not
    sink the run.
    """
    config = load_sources()
    cutoff = datetime.now(timezone.utc) - parse_since(since)

    seen: dict[str, Story] = {}
    headers = {
        "User-Agent": "TechSpark/0.1 (+internal ScottishPower newsletter tool)"
    }
    with httpx.Client(headers=headers) as client:
        for feed in config.feeds:
            for story in _fetch_one(client, feed, cutoff):
                if story.id in seen:
                    continue
                seen[story.id] = story

    batch = StoryBatch(
        fetched_at=datetime.now(timezone.utc),
        since=since,
        stories=sorted(
            seen.values(),
            key=lambda s: s.published or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        ),
    )
    log.info(
        "Fetched %d unique stories since %s across %d feeds",
        len(batch.stories),
        since,
        len(config.feeds),
    )
    return batch
