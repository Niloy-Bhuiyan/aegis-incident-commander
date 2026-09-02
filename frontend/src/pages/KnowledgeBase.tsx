import { useState } from 'react'

import { IconDoc, IconSearch } from '../components/icons'
import { Badge, Card, Empty } from '../components/ui'
import { useDocument, useDocuments, useSearch } from '../hooks/queries'

export function KnowledgeBase() {
  const { data: documents } = useDocuments()
  const [selected, setSelected] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const { data: document } = useDocument(selected)
  const { data: hits, isFetching } = useSearch(query)

  const grouped = (documents ?? []).reduce<Record<string, typeof documents>>((acc, doc) => {
    acc[doc.doc_type] = [...(acc[doc.doc_type] ?? []), doc]
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">
          Knowledge Base
        </h1>
        <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-3">
          {documents?.length ?? 0} indexed documents. Search runs the same hybrid BM25 and dense
          retrieval the investigation workflow uses, fused by reciprocal rank.
        </p>
      </header>

      <Card title="Retrieval preview" hint="try a signal description, not a keyword">
        <div className="relative">
          <IconSearch
            size={15}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="connection pool exhaustion during replica maintenance"
            aria-label="Search the knowledge base"
            data-testid="kb-search"
            className="h-11 w-full rounded-lg border border-line-strong bg-card pr-4 pl-10 text-[13.5px] text-ink shadow-xs transition-colors duration-200 outline-none placeholder:text-ink-3 focus:border-info"
          />
        </div>

        {query.trim().length > 1 && (
          <div className="mt-4 space-y-2.5" data-testid="kb-results">
            {hits?.length ? (
              hits.map((hit, index) => (
                <article
                  key={hit.chunk_id}
                  className="rounded-lg border border-line bg-card px-4 py-3.5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="tnum rounded-md border border-warn-line bg-warn-bg px-1.5 py-0.5 text-[11px] font-semibold text-warn">
                      K{index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                      {hit.title}
                      {hit.heading ? ` — ${hit.heading}` : ''}
                    </span>
                    <Badge value={hit.doc_type} tone="neutral" />
                  </div>
                  <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink-2">
                    {hit.text}
                  </p>
                  <p className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
                    <span>{hit.path}</span>
                    <span>rrf {hit.score.toFixed(4)}</span>
                    <span>bm25 #{hit.lexical_rank ?? '—'}</span>
                    <span>dense #{hit.dense_rank ?? '—'}</span>
                  </p>
                </article>
              ))
            ) : (
              <Empty>{isFetching ? 'Searching…' : 'No matches.'}</Empty>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card title="Corpus" hint={`${documents?.length ?? 0} documents`} bodyClass="space-y-5 p-3">
          {Object.entries(grouped).map(([type, docs]) => (
            <div key={type}>
              <h3 className="mb-2 px-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                {type} · {docs?.length}
              </h3>
              <ul className="space-y-1.5">
                {(docs ?? []).map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(doc.id)}
                      className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-all duration-200 ${
                        selected === doc.id
                          ? 'border-info-line bg-info-bg'
                          : 'border-line bg-card hover:border-line-strong hover:bg-sunken'
                      }`}
                    >
                      <div className="truncate text-[12.5px] font-medium text-ink">{doc.title}</div>
                      <div className="tnum truncate text-[11px] text-ink-3">
                        {doc.path} · {doc.chunks} chunks
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>

        <Card
          title={document?.title ?? 'Document'}
          hint={document?.path}
          actions={document ? <Badge value={document.doc_type} tone="neutral" /> : null}
        >
          {document ? (
            <>
              {document.tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {document.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-[11px] font-medium text-ink-3"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <pre className="max-h-[620px] overflow-auto font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {document.content}
              </pre>
            </>
          ) : (
            <Empty icon={<IconDoc size={17} />}>
              Select a document to read what Aegis retrieves from.
            </Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
