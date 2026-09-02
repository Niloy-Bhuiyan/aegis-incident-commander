import { useState } from 'react'

import { IconDoc, IconSearch } from '../components/icons'
import { Badge, Empty, Panel } from '../components/ui'
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
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Knowledge Base</h1>
        <p className="text-[11px] text-fg-3">
          {documents?.length ?? 0} documents. Search runs the same hybrid BM25 and dense retrieval
          the investigation workflow uses.
        </p>
      </div>

      <Panel title="Retrieval preview" hint="BM25 + dense, fused by reciprocal rank">
        <div className="relative">
          <IconSearch
            size={13}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-3"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="connection pool exhaustion during replica maintenance"
            aria-label="Search the knowledge base"
            data-testid="kb-search"
            className="h-8 w-full rounded-sm border border-line-strong bg-base pr-2 pl-7 text-xs text-fg outline-none transition-colors duration-150 placeholder:text-fg-3 focus:border-info"
          />
        </div>

        {query.trim().length > 1 && (
          <div className="mt-2 space-y-1" data-testid="kb-results">
            {hits?.length ? (
              hits.map((hit, index) => (
                <article
                  key={hit.chunk_id}
                  className="rounded-sm border border-line bg-raised px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tnum rounded-xs border border-warn/30 bg-warn-dim px-1 py-px text-[10px] text-warn">
                      K{index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-fg">
                      {hit.title}
                      {hit.heading ? ` — ${hit.heading}` : ''}
                    </span>
                    <Badge value={hit.doc_type} tone="neutral" />
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-fg-2">
                    {hit.text}
                  </p>
                  <p className="tnum mt-1 flex flex-wrap gap-2 text-[10px] text-fg-3">
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
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Indexed corpus" bodyClass="space-y-2.5 p-2">
          {Object.entries(grouped).map(([type, docs]) => (
            <div key={type}>
              <h3 className="mb-1 px-0.5 text-[9.5px] uppercase tracking-[0.08em] text-fg-3">
                {type} · {docs?.length}
              </h3>
              <ul className="space-y-0.5">
                {(docs ?? []).map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(doc.id)}
                      className={`w-full rounded-sm border px-2 py-1.5 text-left transition-colors duration-150 ${
                        selected === doc.id
                          ? 'border-info/40 bg-info-dim'
                          : 'border-line bg-raised hover:border-line-strong hover:bg-hover'
                      }`}
                    >
                      <div className="truncate text-[11.5px] text-fg">{doc.title}</div>
                      <div className="tnum truncate text-[10px] text-fg-3">
                        {doc.path} · {doc.chunks} chunks
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Panel>

        <Panel
          title={document?.title ?? 'Document'}
          hint={document?.path}
          actions={document ? <Badge value={document.doc_type} tone="neutral" /> : null}
        >
          {document ? (
            <>
              {document.tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {document.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-xs border border-line px-1.5 py-px text-[10px] text-fg-3"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <pre className="max-h-[560px] overflow-auto font-sans text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg-2">
                {document.content}
              </pre>
            </>
          ) : (
            <Empty icon={<IconDoc size={18} />}>
              Select a document to read what Aegis retrieves from.
            </Empty>
          )}
        </Panel>
      </div>
    </div>
  )
}
