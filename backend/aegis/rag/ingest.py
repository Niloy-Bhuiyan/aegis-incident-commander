"""Ingest the markdown knowledge base into the database and embed it."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.models import DocChunk, Document, utcnow
from aegis.rag.chunking import chunk_markdown
from aegis.rag.embeddings import Embedder

KNOWLEDGE_DIR = Path(__file__).resolve().parents[3] / "knowledge"


@dataclass
class FrontMatter:
    title: str
    doc_type: str
    service: str
    tags: list[str]


def parse_front_matter(raw: str, fallback_title: str) -> tuple[FrontMatter, str]:
    """Minimal front-matter parser - avoids a YAML dependency for four keys."""
    title, doc_type, service = fallback_title, "reference", ""
    tags: list[str] = []
    body = raw

    if raw.startswith("---"):
        _, _, rest = raw.partition("\n")
        header, sep, remainder = rest.partition("\n---")
        if sep:
            body = remainder.lstrip("\n")
            for line in header.splitlines():
                key, _, value = line.partition(":")
                key, value = key.strip().lower(), value.strip()
                if key == "title":
                    title = value
                elif key == "type":
                    doc_type = value
                elif key == "service":
                    service = value
                elif key == "tags":
                    tags = [t.strip() for t in value.strip("[]").split(",") if t.strip()]

    return FrontMatter(title, doc_type, service, tags), body


async def ingest_directory(
    session: AsyncSession,
    embedder: Embedder,
    directory: Path | None = None,
) -> dict:
    """Re-ingest every markdown file. Unchanged documents keep their chunks."""
    directory = directory or KNOWLEDGE_DIR
    files = sorted(directory.rglob("*.md"))
    stats = {"documents": 0, "chunks": 0, "skipped_unchanged": 0, "embedder": embedder.name}

    for path in files:
        raw = path.read_text(encoding="utf-8")
        rel = path.relative_to(directory).as_posix()
        front, body = parse_front_matter(raw, fallback_title=path.stem.replace("-", " ").title())
        content_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()

        existing = (
            await session.execute(select(Document).where(Document.path == rel))
        ).scalar_one_or_none()

        if existing and existing.content_hash == content_hash:
            stats["skipped_unchanged"] += 1
            stats["documents"] += 1
            continue

        if existing:
            await session.execute(delete(DocChunk).where(DocChunk.document_id == existing.id))
            doc = existing
        else:
            doc = Document(path=rel)
            session.add(doc)

        doc.title = front.title
        doc.doc_type = front.doc_type
        doc.service = front.service
        doc.tags = front.tags
        doc.content = body
        doc.content_hash = content_hash
        doc.updated_at = utcnow()
        await session.flush()

        chunks = chunk_markdown(body)
        if chunks:
            vectors = embedder.embed([c.text for c in chunks])
            for chunk, vector in zip(chunks, vectors, strict=True):
                session.add(
                    DocChunk(
                        document_id=doc.id,
                        ordinal=chunk.ordinal,
                        heading=chunk.heading,
                        text=chunk.text,
                        embedding=vector,
                    )
                )
        stats["documents"] += 1
        stats["chunks"] += len(chunks)

    await session.commit()
    return stats
