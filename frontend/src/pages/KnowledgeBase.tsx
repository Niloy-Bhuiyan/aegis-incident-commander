import { useState } from 'react'

import { Card, Empty, Pill } from '../components/ui'
import { useDocument, useDocuments, useSearch } from '../hooks/queries'

export function KnowledgeBase() {
  const { data: documents } = useDocuments()
  const [selected, setSelected] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const { data: document } = useDocument(selected)
  const { data: hits } = useSearch(query)

  const grouped = (documents ?? []).reduce<Record<string, typeof documents>>((acc, doc) => {
    acc[doc.doc_type] = [...(acc[doc.doc_type] ?? []), doc]
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
        <p className="mt-1 text-sm text-mist-400">
          The indexed corpus Aegis retrieves from. Search runs the same hybrid BM25 and dense
          retrieval the investigation workflow uses.
        </p>
      </header>

      <Card title="Retrieval preview">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. connection pool exhaustion during replica maintenance"
          data-testid="kb-search"
          className="w-full rounded-lg border border-ink-700 bg-ink-950 px-4 py-2.5 text-sm text-mist-100 outline-none placeholder:text-mist-400 focus:border-signal-500"
        />
        {query.trim().length > 1 && (
          <div className="mt-3 space-y-2" data-testid="kb-results">
            {hits?.length ? (
              hits.map((hit) => (
                <article
                  key={hit.chunk_id}
                  className="rounded-lg border border-ink-800 bg-ink-850/50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-mist-100">
                      {hit.title}
                      {hit.heading ? ` - ${hit.heading}` : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <Pill value={hit.doc_type} />
                      <span className="font-mono text-[10px] text-mist-400">
                        rrf {hit.score.toFixed(4)} · bm25 #{hit.lexical_rank ?? '-'} · dense #
                        {hit.dense_rank ?? '-'}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-mist-300">
                    {hit.text}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-mist-400">{hit.path}</p>
                </article>
              ))
            ) : (
              <Empty>No matches.</Empty>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-[360px_1fr] gap-5">
        <Card title="Indexed documents" subtitle={`${documents?.length ?? 0} documents`}>
          <div className="space-y-4">
            {Object.entries(grouped).map(([type, docs]) => (
              <div key={type}>
                <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-mist-400">{type}</h3>
                <ul className="space-y-1">
                  {(docs ?? []).map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(doc.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                          selected === doc.id
                            ? 'border-signal-500/50 bg-signal-500/10'
                            : 'border-ink-800 bg-ink-850/50 hover:border-ink-600'
                        }`}
                      >
                        <div className="text-xs text-mist-100">{doc.title}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-mist-400">
                          {doc.path} · {doc.chunks} chunks
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card title={document?.title ?? 'Document'} subtitle={document?.path}>
          {document ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Pill value={document.doc_type} />
                {document.service && <Pill value={document.service} />}
                {document.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-ink-600 px-2 py-0.5 text-[10px] text-mist-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-mist-300">
                {document.content}
              </pre>
            </>
          ) : (
            <Empty>Select a document to read it.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
