"""Markdown chunking: split on section headings, then on paragraph runs."""

from __future__ import annotations

import re
from dataclasses import dataclass

MAX_CHARS = 1400
HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")


@dataclass
class Chunk:
    ordinal: int
    heading: str
    text: str


def _split_long(heading: str, body: str) -> list[str]:
    if len(body) <= MAX_CHARS:
        return [body]
    parts: list[str] = []
    current = ""
    for para in body.split("\n\n"):
        if current and len(current) + len(para) + 2 > MAX_CHARS:
            parts.append(current.strip())
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current.strip():
        parts.append(current.strip())
    return parts


def chunk_markdown(content: str) -> list[Chunk]:
    """One chunk per section, carrying its heading so citations stay readable."""
    sections: list[tuple[str, list[str]]] = [("", [])]
    for line in content.splitlines():
        match = HEADING_RE.match(line)
        if match:
            sections.append((match.group(2).strip(), []))
        else:
            sections[-1][1].append(line)

    chunks: list[Chunk] = []
    ordinal = 0
    for heading, lines in sections:
        body = "\n".join(lines).strip()
        if not body:
            continue
        for part in _split_long(heading, body):
            text = f"{heading}\n\n{part}" if heading else part
            chunks.append(Chunk(ordinal=ordinal, heading=heading, text=text))
            ordinal += 1
    return chunks
