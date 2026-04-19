"""Click-based CLI for the Tech Spark pipeline.

Stages run as separate commands so the editor can hand-edit the intermediate
JSON between stages — drop an uninteresting story, pin a must-include one —
before the LLM spends tokens.

Commands:
  techspark fetch    — pull curated RSS feeds, write stories.json
  techspark rank     — score and shortlist top-N, write ranked.json
  techspark insight  — per-story angle + dry one-liner, write insights.json
  techspark draft    — assemble issue and render MD + HTML
  techspark run      — all four, in order
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime
from pathlib import Path

import click

from . import __version__
from .config import repo_root
from .draft import assemble, render
from .insight import generate_insights
from .models import InsightBatch, RankedBatch, StoryBatch, Tone
from .rank import rank as rank_stories
from .sources import fetch_all


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def _default_out() -> Path:
    return repo_root() / "output"


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data.model_dump_json(indent=2), encoding="utf-8")


def _read_json(path: Path, model):
    return model.model_validate_json(path.read_text(encoding="utf-8"))


def _default_month() -> str:
    return datetime.now().strftime("%Y-%m")


@click.group()
@click.version_option(__version__, prog_name="techspark")
@click.option("-v", "--verbose", is_flag=True, help="Enable debug logging.")
@click.pass_context
def main(ctx: click.Context, verbose: bool) -> None:
    """Tech Spark — newsletter collation & drafting tool."""
    ctx.ensure_object(dict)
    _configure_logging(verbose)


@main.command("fetch")
@click.option("--since", default="30d", show_default=True, help="Date window, e.g. 30d, 2w, 48h.")
@click.option(
    "--out",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help="Output path for stories.json (default: output/stories.json).",
)
def cmd_fetch(since: str, out: Path | None) -> None:
    """Pull curated RSS feeds and write deduped stories.json."""
    out = out or (_default_out() / "stories.json")
    batch = fetch_all(since)
    _write_json(out, batch)
    click.echo(f"Wrote {len(batch.stories)} stories to {out}")


@main.command("rank")
@click.option(
    "--in",
    "in_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="Input stories.json (default: output/stories.json).",
)
@click.option("--top", default=20, show_default=True, help="Keep the top-N ranked stories.")
@click.option(
    "--out",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help="Output path for ranked.json (default: output/ranked.json).",
)
def cmd_rank(in_path: Path | None, top: int, out: Path | None) -> None:
    """Rank stories for relevance via Claude (batched tool-use)."""
    in_path = in_path or (_default_out() / "stories.json")
    out = out or (_default_out() / "ranked.json")
    batch = _read_json(in_path, StoryBatch)
    ranked = rank_stories(batch, top=top)
    _write_json(out, ranked)
    click.echo(f"Wrote {len(ranked.items)} ranked stories to {out}")


@main.command("insight")
@click.option(
    "--in",
    "in_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="Input ranked.json (default: output/ranked.json).",
)
@click.option(
    "--tone",
    type=click.Choice(["dry", "neutral", "playful"]),
    default="dry",
    show_default=True,
    help="Voice of the dry one-liner.",
)
@click.option(
    "--out",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help="Output path for insights.json (default: output/insights.json).",
)
def cmd_insight(in_path: Path | None, tone: Tone, out: Path | None) -> None:
    """Generate per-story angles + dry one-liner via Claude."""
    in_path = in_path or (_default_out() / "ranked.json")
    out = out or (_default_out() / "insights.json")
    ranked = _read_json(in_path, RankedBatch)
    batch = generate_insights(ranked, tone=tone)
    _write_json(out, batch)
    click.echo(f"Wrote {len(batch.items)} insights to {out}")


@main.command("draft")
@click.option(
    "--in",
    "in_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=None,
    help="Input insights.json (default: output/insights.json).",
)
@click.option("--month", default=None, help="Issue month label (default: current YYYY-MM).")
@click.option(
    "--out",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="Output directory (default: output/).",
)
def cmd_draft(in_path: Path | None, month: str | None, out: Path | None) -> None:
    """Assemble issue and render Markdown + HTML."""
    in_path = in_path or (_default_out() / "insights.json")
    out_dir = out or _default_out()
    month = month or _default_month()
    batch = _read_json(in_path, InsightBatch)
    issue = assemble(batch, month=month)
    md_path, html_path = render(issue, out_dir)
    click.echo(f"Wrote {md_path}")
    click.echo(f"Wrote {html_path}")


@main.command("run")
@click.option("--since", default="30d", show_default=True, help="Date window for fetch.")
@click.option("--top", default=20, show_default=True, help="Keep the top-N ranked stories.")
@click.option(
    "--tone",
    type=click.Choice(["dry", "neutral", "playful"]),
    default="dry",
    show_default=True,
)
@click.option("--month", default=None, help="Issue month label (default: current YYYY-MM).")
def cmd_run(since: str, top: int, tone: Tone, month: str | None) -> None:
    """Run all four stages end-to-end, writing intermediate JSON along the way."""
    out_dir = _default_out()
    month = month or _default_month()

    click.echo("==> fetch")
    stories = fetch_all(since)
    _write_json(out_dir / "stories.json", stories)
    click.echo(f"  {len(stories.stories)} stories")

    click.echo("==> rank")
    ranked = rank_stories(stories, top=top)
    _write_json(out_dir / "ranked.json", ranked)
    click.echo(f"  {len(ranked.items)} ranked")

    click.echo("==> insight")
    insights = generate_insights(ranked, tone=tone)
    _write_json(out_dir / "insights.json", insights)
    click.echo(f"  {len(insights.items)} insights")

    click.echo("==> draft")
    issue = assemble(insights, month=month)
    md_path, html_path = render(issue, out_dir)
    click.echo(f"  {md_path}")
    click.echo(f"  {html_path}")


if __name__ == "__main__":
    sys.exit(main())
