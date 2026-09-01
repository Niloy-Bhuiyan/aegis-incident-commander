"""The investigation context: everything the model is allowed to reason over.

Evidence and knowledge both carry a short reference (E1, K3). Those references
are the only citation vocabulary; anything outside this set is rejected as a
fabricated citation.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class EvidenceItem:
    ref: str
    kind: str
    source: str
    title: str
    content: str
    data: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "ref": self.ref,
            "kind": self.kind,
            "source": self.source,
            "title": self.title,
            "content": self.content,
            "data": self.data,
        }


@dataclass
class InvestigationContext:
    incident_title: str
    service: str
    severity: str
    breach_summary: str
    evidence: list[EvidenceItem] = field(default_factory=list)
    knowledge: list[EvidenceItem] = field(default_factory=list)

    @property
    def valid_refs(self) -> set[str]:
        return {item.ref for item in self.evidence} | {item.ref for item in self.knowledge}

    def render(self) -> str:
        lines = [
            f"INCIDENT: {self.incident_title}",
            f"ORIGIN SERVICE (from deterministic correlation): {self.service}",
            f"SEVERITY: {self.severity}",
            f"SLO BREACHES: {self.breach_summary}",
            "",
            "== TELEMETRY AND CHANGE EVIDENCE ==",
        ]
        for item in self.evidence:
            lines.append(f"[{item.ref}] ({item.kind} from {item.source}) {item.title}")
            lines.append(item.content.strip())
            lines.append("")

        lines.append("== RETRIEVED KNOWLEDGE BASE EXCERPTS ==")
        if not self.knowledge:
            lines.append("(no documents retrieved)")
        for item in self.knowledge:
            lines.append(f"[{item.ref}] ({item.source}) {item.title}")
            lines.append(item.content.strip())
            lines.append("")

        return "\n".join(lines)
