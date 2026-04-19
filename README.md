# Tech Spark

Automated collation-to-draft pipeline for **Tech Spark**, the monthly digital &
IT innovation newsletter for a ScottishPower / Iberdrola internal audience.

It pulls recent stories from curated RSS feeds, ranks them for relevance to
energy & utilities and to the organisation, generates an angle + a dry
one-liner per story, and emits a Markdown + email-ready HTML draft for the
editor to review and edit before publication.

```
feeds ──► fetch ──► rank ──► insight ──► draft ──► MD + HTML
         (RSS)    (Sonnet)   (Opus)    (Jinja2)
```

## Quickstart

```bash
# 1. Set up a venv and install
python3 -m venv .venv && source .venv/bin/activate
pip install -e .

# 2. Configure
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY

# 3. Run end-to-end
techspark run --month 2026-04 --since 30d --tone dry

# …or step by step (lets you hand-edit the JSON between stages)
techspark fetch --since 30d
techspark rank --top 20
techspark insight --tone dry
techspark draft --month 2026-04
```

Output lands in `output/` (gitignored):

- `stories.json` — raw, deduped, date-windowed feed entries
- `ranked.json` — top-N with relevance score, category, rationale
- `insights.json` — per-story summary + angles + dry one-liner
- `YYYY-MM-techspark.md` — editable source of truth
- `YYYY-MM-techspark.html` — inline-styled, email-client safe

## CLI surface

```
techspark fetch   [--since 30d] [--out output/stories.json]
techspark rank    [--in stories.json] [--top 20] [--out ranked.json]
techspark insight [--in ranked.json] [--tone dry] [--out insights.json]
techspark draft   [--in insights.json] [--month 2026-04] [--out output/]
techspark run     [--month 2026-04] [--since 30d] [--tone dry]
```

Each stage writes JSON the next reads, so you can drop an uninteresting
story (edit `stories.json` or `ranked.json`) or pin a must-include one
before the LLM spends tokens on insights.

## Editing the pipeline

The entire editorial character lives in plain text under `config/` — no code
change needed to tweak it.

- **Feeds:** `config/sources.yaml` — add/remove/re-tag curated RSS feeds.
- **House context:** `config/org_context.md` — audience, what the org cares
  about, house voice, ranking rubric. Sent as a cached system prompt on
  every LLM call.
- **Prompts:**
  - `config/prompts/rank.md` — ranking rubric
  - `config/prompts/insight.md` — per-story angle template
  - `config/prompts/humour.md` — tone dial (dry / neutral / playful)
  - `config/prompts/draft.md` — editor note + trend spotlight assembly
- **Templates:** `templates/newsletter.md.j2` and `newsletter.html.j2`.

## Models

- **Ranking:** `claude-sonnet-4-6` — batched (≤20 stories per call), cheaper.
- **Insight & draft:** `claude-opus-4-7` — quality matters for voice. Uses
  adaptive thinking (the only on-mode on Opus 4.7).

The stable `org_context.md` is sent as an ephemeral-cached system block, so
subsequent calls in a run pay the cache-hit rate after the first.

## Tone dial

`--tone dry` (default), `--tone neutral`, or `--tone playful`. The flag is
threaded into `humour.md` as a single variable; no code change needed to
tune tones further.

## Verification

1. **Install & help:** `pip install -e .` then `techspark --help`.
2. **Fetch smoke:** `techspark fetch --since 7d` writes `output/stories.json`
   with ≥ 20 deduped items across categories. Feed failures log-warn, not
   crash.
3. **End-to-end:** `techspark run --month 2026-04 --tone dry` produces
   `output/2026-04-techspark.{md,html}`.
4. **Tests:** `pytest tests/test_smoke.py` — feed parse on a fixture and
   template render with a mocked LLM.

## Layout

```
Newsletter/
├── README.md
├── pyproject.toml
├── .env.example
├── .gitignore
├── config/
│   ├── sources.yaml
│   ├── org_context.md
│   └── prompts/{rank,insight,humour,draft}.md
├── templates/
│   ├── newsletter.md.j2
│   └── newsletter.html.j2
├── src/techspark/
│   ├── cli.py config.py models.py sources.py
│   ├── llm.py cache.py rank.py insight.py draft.py
├── output/                 # generated, gitignored
└── tests/test_smoke.py
```
