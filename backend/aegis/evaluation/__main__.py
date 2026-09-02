"""CLI: python -m aegis.evaluation [--out report.json] [--database-url URL]"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from aegis.evaluation.runner import Evaluator

DEFAULT_DB = "sqlite+aiosqlite:///./eval.db"


def format_report(report: dict) -> str:
    metrics = report["metrics"]
    lines = [
        "",
        "Aegis evaluation",
        "=" * 62,
        f"provider   {report['provider']} ({report['model']})",
        f"embedder   {report['embedder']}",
        f"cases      {metrics['cases']}",
        "-" * 62,
    ]
    order = [
        ("detection_rate", "detection rate"),
        ("origin_service_accuracy", "origin service accuracy"),
        ("root_cause_top1_accuracy", "root cause top-1 accuracy"),
        ("root_cause_recall_in_ranked_set", "root cause recall (ranked set)"),
        ("citation_validity", "citation validity"),
        ("unsupported_claims_per_hypothesis", "unsupported claims / hypothesis"),
        ("retrieval_hit_rate", "retrieval hit rate"),
        ("remediation_accuracy", "remediation accuracy"),
        ("recovery_success_rate", "recovery success rate"),
        ("mean_detection_ticks", "mean detection ticks"),
        ("mean_investigation_seconds", "mean investigation seconds"),
        ("mean_case_seconds", "mean case seconds"),
        ("total_input_tokens", "total input tokens"),
        ("total_output_tokens", "total output tokens"),
        ("total_cost_usd", "total cost (USD)"),
    ]
    for key, label in order:
        lines.append(f"{label:<34} {metrics[key]}")

    lines.append("-" * 62)
    for case in report["cases"]:
        flags = [
            ("detect", case["detected"]),
            ("origin", case["origin_correct"]),
            ("cause", case["root_cause_top1_correct"]),
            ("action", case["remediation_correct"]),
            ("recover", case["recovery_verified"]),
        ]
        summary = " ".join(f"{name}={'ok' if ok else 'MISS'}" for name, ok in flags)
        lines.append(f"{case['scenario_id']:<32} {summary}")
        for note in case["notes"]:
            lines.append(f"{'':<32} note: {note}")
    lines.append("")
    return "\n".join(lines)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Aegis evaluation suite")
    parser.add_argument("--out", type=Path, default=Path("eval_reports/latest.json"))
    parser.add_argument("--database-url", default=DEFAULT_DB)
    args = parser.parse_args()

    report = await Evaluator(args.database_url).run()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(format_report(report))
    print(f"report written to {args.out}")


if __name__ == "__main__":
    asyncio.run(main())
