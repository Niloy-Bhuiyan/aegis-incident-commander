"""Hybrid retrieval over the knowledge base.

BM25 for lexical precision (service names, error strings, config keys) fused
with dense cosine similarity for topical recall, combined by reciprocal rank
fusion. Every returned chunk keeps its document id, so a citation can always be
resolved back to a real source - unresolvable citations are rejected upstream.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.models import DocChunk, Document
from aegis.rag.embeddings import Embedder, cosine, tokenize

RRF_K = 60


@dataclass
class IndexedChunk:
    chunk_id: int
    document_id: int
    title: str
    path: str
    doc_type: str
    service: str
    heading: str
    text: str
    embedding: list[float]
    tokens: list[str]


@dataclass
class RetrievedChunk:
    ref: str
    chunk_id: int
    document_id: int
    title: str
    path: str
    doc_type: str
    service: str
    heading: str
    text: str
    score: float
    lexical_rank: int | None
    dense_rank: int | None

    def as_dict(self) -> dict:
        return {
            "ref": self.ref,
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "title": self.title,
            "path": self.path,
            "doc_type": self.doc_type,
            "service": self.service,
            "heading": self.heading,
            "text": self.text,
            "score": round(self.score, 5),
            "lexical_rank": self.lexical_rank,
            "dense_rank": self.dense_rank,
        }


class KnowledgeStore:
    """In-memory index rebuilt from the database at startup and after ingest."""

    def __init__(self, embedder: Embedder) -> None:
        self.embedder = embedder
        self.chunks: list[IndexedChunk] = []
        self._df: Counter[str] = Counter()
        self._avg_len: float = 0.0

    @property
    def size(self) -> int:
        return len(self.chunks)

    async def load(self, session: AsyncSession) -> None:
        rows = (
            await session.execute(
                select(DocChunk, Document).join(Document, DocChunk.document_id == Document.id)
            )
        ).all()
        self.chunks = [
            IndexedChunk(
                chunk_id=chunk.id,
                document_id=doc.id,
                title=doc.title,
                path=doc.path,
                doc_type=doc.doc_type,
                service=doc.service,
                heading=chunk.heading,
                text=chunk.text,
                embedding=list(chunk.embedding or []),
                tokens=tokenize(chunk.text),
            )
            for chunk, doc in rows
        ]
        self._reindex()

    def _reindex(self) -> None:
        self._df = Counter()
        total = 0
        for chunk in self.chunks:
            total += len(chunk.tokens)
            for token in set(chunk.tokens):
                self._df[token] += 1
        self._avg_len = total / len(self.chunks) if self.chunks else 0.0

    # ------------------------------------------------------------- scoring

    def _bm25(self, query_tokens: list[str], k1: float = 1.5, b: float = 0.75) -> list[float]:
        n = len(self.chunks)
        scores = [0.0] * n
        if not n or not self._avg_len:
            return scores
        for i, chunk in enumerate(self.chunks):
            freqs = Counter(chunk.tokens)
            length = len(chunk.tokens)
            score = 0.0
            for token in query_tokens:
                tf = freqs.get(token, 0)
                if not tf:
                    continue
                df = self._df.get(token, 0)
                idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
                denom = tf + k1 * (1 - b + b * length / self._avg_len)
                score += idf * (tf * (k1 + 1)) / denom
            scores[i] = score
        return scores

    def _dense(self, query: str) -> list[float]:
        if not self.chunks:
            return []
        query_vec = self.embedder.embed([query])[0]
        return [cosine(query_vec, chunk.embedding) for chunk in self.chunks]

    def search(
        self,
        query: str,
        k: int = 6,
        service: str | None = None,
        doc_types: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        """Metadata-filtered hybrid search. Returns at most k chunks."""
        if not self.chunks:
            return []

        candidates = [
            i
            for i, chunk in enumerate(self.chunks)
            if (doc_types is None or chunk.doc_type in doc_types)
        ]
        if service:
            # Prefer service-scoped and global docs; fall back to everything if
            # the filter would leave too little to work with.
            scoped = [
                i
                for i in candidates
                if self.chunks[i].service in ("", service)
                or service in self.chunks[i].text
            ]
            if len(scoped) >= k:
                candidates = scoped

        lexical = self._bm25(tokenize(query))
        dense = self._dense(query)

        lex_order = sorted(candidates, key=lambda i: lexical[i], reverse=True)
        dense_order = sorted(candidates, key=lambda i: dense[i], reverse=True)
        lex_rank = {idx: r for r, idx in enumerate(lex_order) if lexical[idx] > 0}
        dense_rank = {idx: r for r, idx in enumerate(dense_order) if dense[idx] > 0}

        fused: list[tuple[float, int]] = []
        for idx in candidates:
            score = 0.0
            if idx in lex_rank:
                score += 1.0 / (RRF_K + lex_rank[idx] + 1)
            if idx in dense_rank:
                score += 1.0 / (RRF_K + dense_rank[idx] + 1)
            if score:
                fused.append((score, idx))

        fused.sort(key=lambda pair: (-pair[0], pair[1]))
        results: list[RetrievedChunk] = []
        for position, (score, idx) in enumerate(fused[:k], start=1):
            chunk = self.chunks[idx]
            results.append(
                RetrievedChunk(
                    ref=f"K{position}",
                    chunk_id=chunk.chunk_id,
                    document_id=chunk.document_id,
                    title=chunk.title,
                    path=chunk.path,
                    doc_type=chunk.doc_type,
                    service=chunk.service,
                    heading=chunk.heading,
                    text=chunk.text,
                    score=score,
                    lexical_rank=lex_rank.get(idx),
                    dense_rank=dense_rank.get(idx),
                )
            )
        return results
