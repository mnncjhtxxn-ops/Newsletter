"""Render a demo issue using fixture stories + canned insights.

This bypasses the LLM (no API key needed) and the live RSS fetch (sandbox
blocks egress) so the template path can be eyeballed end-to-end. Run with:

    python scripts/demo_render.py
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from techspark.config import repo_root
from techspark.draft import render
from techspark.models import (
    Insight,
    Issue,
    Ranking,
    Story,
    StoryInsight,
    TrendSpotlight,
)


def _story(idx: int, title: str, source: str, url: str, summary: str) -> Story:
    return Story(
        id=f"demo{idx:03d}",
        title=title,
        url=url,
        source=source,
        source_category="energy_utilities",
        published=datetime(2026, 4, 10 + idx, 9, 0, tzinfo=timezone.utc),
        summary=summary,
    )


SPARKS = [
    StoryInsight(
        story=_story(
            1,
            "Ofgem consults on RIIO-ED3 network resilience reforms",
            "Ofgem",
            "https://example.com/ofgem-resilience",
            "Regulator opens consultation on resilience obligations for DNOs.",
        ),
        ranking=Ranking(
            id="demo001",
            score_0_10=9,
            category="regulation_policy",
            rationale="Direct UK regulatory consultation touching network resilience.",
        ),
        insight=Insight(
            summary="Ofgem has opened a consultation on RIIO-ED3 resilience obligations, "
            "introducing tighter cyber and storm-response expectations for DNOs ahead of "
            "the next price control.",
            energy_utilities_angle="Sets the resilience yardstick every GB DNO will be "
            "measured against for the next decade — capex plans and incident-response "
            "playbooks will need to be re-justified.",
            org_angle="SP Energy Networks will need to evidence both cyber maturity and "
            "storm-response timelines under the proposed metrics; expect knock-on demand "
            "on the IT/OT teams.",
            broader_angle="n/a",
            dry_line="Another consultation, another set of dashboards waiting to be commissioned.",
        ),
    ),
    StoryInsight(
        story=_story(
            2,
            "Hyperscaler revises 2030 net-zero pledge to 2040",
            "Hyperscaler News",
            "https://example.com/cloud-netzero",
            "Major cloud provider announces revised 2040 net-zero pledge.",
        ),
        ranking=Ranking(
            id="demo002",
            score_0_10=8,
            category="cloud_infra",
            rationale="Material shift in cloud-sector emissions trajectory.",
        ),
        insight=Insight(
            summary="A major hyperscaler has pushed its net-zero target from 2030 to 2040, "
            "citing AI-driven power demand. Scope-3 reporting for cloud customers will be "
            "revised accordingly.",
            energy_utilities_angle="Cloud providers are now visibly load-shaping the grid; "
            "expect tighter conversations with TSOs about siting, PPAs and demand response.",
            org_angle="Our scope-3 cloud emissions accounting will move with the vendor's "
            "numbers — sustainability reporting templates will need a footnote, and the "
            "FinOps team should pre-empt awkward questions.",
            broader_angle="A bellwether for how seriously the hyperscalers' early-decade "
            "pledges should now be read across the wider sector.",
            dry_line="The future, as it turns out, was always going to be slightly further away than last time.",
        ),
    ),
    StoryInsight(
        story=_story(
            3,
            "Enterprise reports first AI-triaged production incidents",
            "Tech Daily",
            "https://example.com/ai-oncall",
            "Large enterprise reports incidents triaged end-to-end by AI agents.",
        ),
        ranking=Ranking(
            id="demo003",
            score_0_10=8,
            category="ai_ml",
            rationale="AI agents in regulated production with human approval gates.",
        ),
        insight=Insight(
            summary="A FTSE-100 enterprise has reported its first month of AI-agent-led "
            "incident triage in production, with humans retaining approval over remediation "
            "actions. Mean-time-to-acknowledge fell sharply.",
            energy_utilities_angle="A live precedent for AI agents inside regulated change-"
            "control regimes — directly relevant to NOC and SOC operations across utilities.",
            org_angle="Worth a read for our SRE and SOC leads as we scope where agentic "
            "tooling can sit alongside ITIL change windows without bumping into Ofgem or NIS "
            "obligations.",
            broader_angle="n/a",
            dry_line="On-call, now with a colleague who never sleeps and rarely sulks about it.",
        ),
    ),
    StoryInsight(
        story=_story(
            4,
            "NCSC issues fresh advisory on OT supply-chain risk",
            "NCSC",
            "https://example.com/ncsc-ot",
            "NCSC publishes guidance on managing OT supply-chain risk in CNI.",
        ),
        ranking=Ranking(
            id="demo004",
            score_0_10=8,
            category="cyber",
            rationale="Direct NCSC guidance on CNI OT supply chain.",
        ),
        insight=Insight(
            summary="The NCSC has published refreshed guidance for CNI operators on "
            "third-party and component risk in OT environments, with explicit expectations "
            "around firmware provenance.",
            energy_utilities_angle="Tightens the implicit bar for OT vendor due-diligence "
            "across generation, networks and metering — auditors will use this as a "
            "checklist.",
            org_angle="Procurement and OT cyber should co-own the response; expect to map "
            "the NCSC checklist against existing assurance for SCADA, AMI and substation "
            "automation suppliers.",
            broader_angle="n/a",
            dry_line="Supply-chain risk: now with footnotes.",
        ),
    ),
    StoryInsight(
        story=_story(
            5,
            "Smart meter rollout passes a quiet milestone",
            "Utility Week",
            "https://example.com/smart-meters",
            "GB smart meter coverage edges past the latest target threshold.",
        ),
        ranking=Ranking(
            id="demo005",
            score_0_10=7,
            category="customer_retail",
            rationale="UK smart-meter rollout numbers, retail-relevant.",
        ),
        insight=Insight(
            summary="GB smart meter coverage has edged past a further rollout milestone, "
            "with installation rates steady but stubborn pockets of legacy meters remaining "
            "in the long tail.",
            energy_utilities_angle="The marginal install is now meaningfully more expensive "
            "than the average — retailers should expect renewed scrutiny of their long-tail "
            "strategies.",
            org_angle="Customer ops will recognise the long-tail story; the data team's "
            "next move is probably making the unmetered minority visible enough to plan for.",
            broader_angle="n/a",
            dry_line="The last ten percent: where rollout strategies go to be quietly re-baselined.",
        ),
    ),
]

QUICK_HITS = [
    StoryInsight(
        story=_story(
            6,
            "AWS announces a new region in northern England",
            "AWS What's New",
            "https://example.com/aws-region",
            "AWS opens a new UK region.",
        ),
        ranking=Ranking(id="demo006", score_0_10=6, category="cloud_infra", rationale="UK cloud capacity."),
        insight=Insight(
            summary="A new AWS region near Manchester comes online this quarter.",
            energy_utilities_angle="More UK-resident cloud capacity for data-residency-bound workloads.",
            org_angle="Worth checking against our data-residency posture before the next architecture review.",
            broader_angle="n/a",
            dry_line="Another region, another reason to update the cloud-residency slide.",
        ),
    ),
    StoryInsight(
        story=_story(
            7,
            "EU AI Act enforcement guidance lands",
            "EU Commission",
            "https://example.com/eu-ai",
            "Commission publishes operational guidance on AI Act obligations.",
        ),
        ranking=Ranking(id="demo007", score_0_10=7, category="regulation_policy", rationale="EU AI Act guidance."),
        insight=Insight(
            summary="Operational guidance on AI Act obligations has been published.",
            energy_utilities_angle="Iberdrola group entities operating in the EU now have the implementation playbook.",
            org_angle="UK entities should track the guidance for de-facto read-across via group standards.",
            broader_angle="n/a",
            dry_line="Operational guidance: where ambition meets the spreadsheet.",
        ),
    ),
]

TRENDS = [
    TrendSpotlight(
        title="Resilience is the new compliance",
        body="Three of this issue's stories — Ofgem's RIIO-ED3 consultation, the NCSC OT advisory, "
        "and the latest hyperscaler net-zero revision — converge on the same theme: resilience and "
        "scope-3 obligations are quietly graduating from posture statements to audit-grade evidence "
        "requirements. Expect dashboards, suppliers questionnaires, and considerably more "
        "footnotes in the FY27 annual report.",
        dry_line="Resilience: the discipline of preparing slides for the things you hope never happen.",
    ),
]


def main() -> None:
    issue = Issue(
        month="2026-04",
        tone="dry",
        editor_note=(
            "This month: Ofgem turns the resilience screw, the hyperscalers quietly slide their "
            "net-zero calendars rightward, and AI agents are being trusted with on-call rotations "
            "(under adult supervision). Demo render — real stories will be richer, but the shape is here."
        ),
        sparks=SPARKS,
        trends=TRENDS,
        quick_hits=QUICK_HITS,
    )
    out_dir = repo_root() / "output"
    md_path, html_path = render(issue, out_dir)
    print(f"Wrote {md_path}")
    print(f"Wrote {html_path}")


if __name__ == "__main__":
    main()
