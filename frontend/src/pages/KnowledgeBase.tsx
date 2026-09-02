import { useState } from 'react'

import { Markdown } from '../components/Markdown'
import { Card, Empty } from '../components/ui'
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
    <div className="space-y-7">
      <header>
        <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">
          Knowledge Base
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          The runbooks, architecture notes and past postmortems Aegis reads during an
          investigation. Search here to see exactly what it would retrieve, and why each result
          ranked where it did.
        </p>
      </header>

      <section>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search — try: connection pool exhaustion during replica maintenance"
          aria-label="Search the knowledge base"
          data-testid="kb-search"
          className="h-10 w-full rounded-md border border-line bg-page px-3.5 text-[13px] text-ink transition-colors duration-150 outline-none placeholder:text-ink-3 focus:border-ink"
        />

        {query.trim().length > 1 && (
          <div className="mt-4" data-testid="kb-results">
            {hits?.length ? (
              <ul className="border-t border-line">
                {hits.map((hit, index) => (
                  <li key={hit.chunk_id} className="border-b border-line py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="tnum text-[11.5px] text-ink-3">K{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {hit.title}
                        {hit.heading ? ` — ${hit.heading}` : ''}
                      </span>
                      <span className="text-[11.5px] text-ink-3">{hit.doc_type}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 pl-7 text-[12.5px] leading-relaxed text-ink-2">
                      {hit.text}
                    </p>
                    <p className="tnum mt-1 flex flex-wrap gap-x-4 pl-7 text-[11px] text-ink-3">
                      <span>{hit.path}</span>
                      <span>keyword rank #{hit.lexical_rank ?? '—'}</span>
                      <span>meaning rank #{hit.dense_rank ?? '—'}</span>
                      <span>combined {hit.score.toFixed(4)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{isFetching ? 'Searching…' : 'No matches.'}</Empty>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Documents" className="space-y-5">
          {Object.entries(grouped).map(([type, docs]) => (
            <div key={type}>
              <h2 className="text-[11.5px] text-ink-3">
                {type} · {docs?.length}
              </h2>
              <ul className="mt-1.5 space-y-px">
                {(docs ?? []).map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(doc.id)}
                      className={`w-full rounded-sm px-2 py-1.5 text-left transition-colors duration-150 ${
                        selected === doc.id ? 'bg-sunken text-ink' : 'text-ink-2 hover:bg-sunken'
                      }`}
                    >
                      <span className="block truncate text-[12.5px]">{doc.title}</span>
                      <span className="tnum block truncate text-[11px] text-ink-3">
                        {doc.chunks} chunks
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <Card bare title={document?.title ?? 'Select a document'} hint={document?.path}>
          {document ? (
            <div className="max-h-[640px] overflow-y-auto border-t border-line pt-4 pr-1">
              <Markdown content={document.content} />
            </div>
          ) : (
            <Empty>Pick a document on the left to read what Aegis retrieves from.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
