"""Knowledge base browsing, search and re-indexing."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aegis.api.deps import get_store, require_token
from aegis.api.schemas import DocumentDetail, DocumentSummary, SearchHit
from aegis.config import get_settings
from aegis.db import get_session
from aegis.models import DocChunk, Document
from aegis.rag.embeddings import build_embedder
from aegis.rag.ingest import ingest_directory
from aegis.rag.store import KnowledgeStore

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/documents", response_model=list[DocumentSummary])
async def list_documents(session: AsyncSession = Depends(get_session)) -> list[DocumentSummary]:
    counts = dict(
        (
            await session.execute(
                select(DocChunk.document_id, func.count(DocChunk.id)).group_by(DocChunk.document_id)
            )
        ).all()
    )
    rows = (
        await session.execute(select(Document).order_by(Document.doc_type, Document.title))
    ).scalars().all()
    return [
        DocumentSummary(
            id=doc.id,
            path=doc.path,
            title=doc.title,
            doc_type=doc.doc_type,
            service=doc.service,
            tags=doc.tags,
            chunks=counts.get(doc.id, 0),
            updated_at=doc.updated_at,
        )
        for doc in rows
    ]


@router.get("/documents/{document_id}", response_model=DocumentDetail)
async def get_document(
    document_id: int, session: AsyncSession = Depends(get_session)
) -> DocumentDetail:
    doc = await session.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="document not found")
    count = (
        await session.execute(
            select(func.count(DocChunk.id)).where(DocChunk.document_id == document_id)
        )
    ).scalar_one()
    return DocumentDetail(
        id=doc.id,
        path=doc.path,
        title=doc.title,
        doc_type=doc.doc_type,
        service=doc.service,
        tags=doc.tags,
        chunks=count,
        updated_at=doc.updated_at,
        content=doc.content,
    )


@router.get("/search", response_model=list[SearchHit])
async def search(
    q: str = Query(min_length=2),
    k: int = Query(default=6, ge=1, le=20),
    service: str | None = None,
    store: KnowledgeStore = Depends(get_store),
) -> list[SearchHit]:
    return [SearchHit(**hit.as_dict()) for hit in store.search(q, k=k, service=service)]


@router.post("/reindex", dependencies=[Depends(require_token)])
async def reindex(
    session: AsyncSession = Depends(get_session),
    store: KnowledgeStore = Depends(get_store),
) -> dict:
    settings = get_settings()
    embedder = build_embedder(settings.voyage_api_key, settings.embedding_model)
    stats = await ingest_directory(session, embedder)
    store.embedder = embedder
    await store.load(session)
    return {**stats, "indexed_chunks": store.size}
