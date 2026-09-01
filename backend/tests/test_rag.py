"""Retrieval: chunking, ingest, and whether search finds the right document."""

from __future__ import annotations

import pytest

from aegis.agent.schema_utils import strict_json_schema
from aegis.agent.schemas import CriticReview, HypothesisSet, RemediationProposal
from aegis.rag.chunking import chunk_markdown
from aegis.rag.embeddings import HashedBagOfWordsEmbedder, cosine
from aegis.rag.ingest import ingest_directory, parse_front_matter
from aegis.rag.store import KnowledgeStore


def test_front_matter_is_parsed_and_stripped():
    raw = (
        "---\ntitle: Runbook X\ntype: runbook\nservice: gateway\n"
        "tags: [a, b]\n---\n\n# Body\ntext"
    )
    front, body = parse_front_matter(raw, "fallback")
    assert front.title == "Runbook X"
    assert front.doc_type == "runbook"
    assert front.service == "gateway"
    assert front.tags == ["a", "b"]
    assert body.startswith("# Body")


def test_chunking_splits_on_headings_and_keeps_them():
    chunks = chunk_markdown("# Title\n\nintro\n\n## Section A\n\nalpha\n\n## Section B\n\nbeta")
    headings = [c.heading for c in chunks]
    assert "Section A" in headings
    assert any("alpha" in c.text for c in chunks)
    assert all(c.heading in c.text or not c.heading for c in chunks)


def test_embedder_is_deterministic_and_normalised():
    embedder = HashedBagOfWordsEmbedder()
    first = embedder.embed(["connection pool exhaustion"])[0]
    second = embedder.embed(["connection pool exhaustion"])[0]
    assert first == second
    assert cosine(first, second) == pytest.approx(1.0, abs=1e-6)
    unrelated = embedder.embed(["jwt signing key rotation"])[0]
    assert cosine(first, unrelated) < 0.5


async def test_ingest_indexes_the_knowledge_base(session):
    embedder = HashedBagOfWordsEmbedder()
    stats = await ingest_directory(session, embedder)
    assert stats["documents"] >= 10
    assert stats["chunks"] > stats["documents"]

    store = KnowledgeStore(embedder)
    await store.load(session)
    assert store.size == stats["chunks"]


async def test_reingest_skips_unchanged_documents(session):
    embedder = HashedBagOfWordsEmbedder()
    first = await ingest_directory(session, embedder)
    second = await ingest_directory(session, embedder)
    assert second["skipped_unchanged"] == first["documents"]


@pytest.mark.parametrize(
    ("query", "expected_path_fragment"),
    [
        ("checkout latency regression after release rollback", "latency-regression"),
        ("auth service 5xx spike jwt signing key config revert", "auth-5xx"),
        ("payments-db connection pool exhaustion saturation", "database-connection"),
    ],
)
async def test_search_retrieves_the_relevant_runbook(session, query, expected_path_fragment):
    embedder = HashedBagOfWordsEmbedder()
    await ingest_directory(session, embedder)
    store = KnowledgeStore(embedder)
    await store.load(session)

    hits = store.search(query, k=6)
    assert hits, "search returned nothing"
    assert any(expected_path_fragment in hit.path for hit in hits), [h.path for h in hits]


async def test_every_hit_resolves_to_a_real_document(session):
    embedder = HashedBagOfWordsEmbedder()
    await ingest_directory(session, embedder)
    store = KnowledgeStore(embedder)
    await store.load(session)

    hits = store.search("database saturation", k=5)
    known_ids = {c.document_id for c in store.chunks}
    for hit in hits:
        assert hit.document_id in known_ids
        assert hit.text


@pytest.mark.parametrize("model", [HypothesisSet, CriticReview, RemediationProposal])
def test_strict_schema_is_self_contained(model):
    schema = strict_json_schema(model)
    assert "$defs" not in schema
    assert "$ref" not in str(schema)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
