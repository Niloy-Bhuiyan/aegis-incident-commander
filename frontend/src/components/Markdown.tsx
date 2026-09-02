import type { ReactNode } from 'react'

/**
 * A small markdown renderer for the knowledge base.
 *
 * The corpus is written by us and is deliberately plain: headings, paragraphs,
 * lists, tables, inline code and bold. That is a short enough grammar to parse
 * directly, which avoids pulling a markdown library and its sanitiser into the
 * bundle for six constructs. Nothing here renders raw HTML.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="tnum rounded border border-line bg-sunken px-1 py-px text-[12px] text-ink"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

function isTableDivider(line: string) {
  return /^\s*\|?[\s:-]*-[-\s|:]*\|?\s*$/.test(line) && line.includes('-')
}

function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(
      <p key={blocks.length} className="text-[13.5px] leading-relaxed text-ink-2">
        {inline(paragraph.join(' '))}
      </p>,
    )
    paragraph = []
  }

  const flushList = () => {
    if (!list) return
    const { ordered, items } = list
    const Tag = ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag
        key={blocks.length}
        className={`space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2 ${
          ordered ? 'list-decimal' : 'list-disc'
        }`}
      >
        {items.map((item, i) => (
          <li key={i} className="pl-1">
            {inline(item)}
          </li>
        ))}
      </Tag>,
    )
    list = null
  }

  const flush = () => {
    flushParagraph()
    flushList()
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flush()
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flush()
      const level = heading[1].length
      const text = heading[2]
      const styles =
        level === 1
          ? 'text-[19px] font-bold text-ink mt-1'
          : level === 2
            ? 'text-[15.5px] font-bold text-ink mt-5'
            : 'text-[13.5px] font-semibold text-ink mt-4'
      blocks.push(
        <h3 key={blocks.length} className={styles}>
          {text}
        </h3>,
      )
      continue
    }

    // Table: a header row followed by a divider row.
    if (trimmed.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flush()
      const header = cells(trimmed)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(cells(lines[i]))
        i += 1
      }
      i -= 1
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th
                    key={c}
                    className="border-b border-line px-3 py-2 text-left font-semibold text-ink"
                  >
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-line px-3 py-2 align-top text-ink-2">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      const text = (bullet ?? numbered)![1]
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push(text)
      continue
    }

    // A continuation line of the current list item or paragraph.
    if (list) {
      list.items[list.items.length - 1] += ` ${trimmed}`
      continue
    }
    paragraph.push(trimmed)
  }

  flush()

  return <div className="space-y-3">{blocks}</div>
}
