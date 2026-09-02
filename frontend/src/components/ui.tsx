import type { ReactNode } from 'react'

/* -------------------------------------------------------------------------
   Primitives, deliberately plain.

   No filled pills, no shadows, no tinted panels. A status is a small coloured
   dot next to a word — the dot carries the glance, the word carries the
   meaning, and neither depends on the reader distinguishing hues.
------------------------------------------------------------------------- */

export type Tone = 'ok' | 'warn' | 'alarm' | 'info' | 'neutral'

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  alarm: 'text-alarm',
  info: 'text-info',
  neutral: 'text-ink-3',
}

/** Single source of truth mapping domain states onto the status palette. */
export function toneFor(value: string): Tone {
  switch (value) {
    case 'healthy':
    case 'resolved':
    case 'supported':
    case 'executed':
    case 'low':
      return 'ok'
    case 'degraded':
    case 'failed':
    case 'unsupported':
    case 'contradicted':
    case 'SEV1':
    case 'high':
      return 'alarm'
    case 'awaiting_approval':
    case 'awaiting_execution':
    case 'open':
    case 'partially_supported':
    case 'dry_run':
    case 'SEV2':
    case 'medium':
      return 'warn'
    case 'investigating':
    case 'remediating':
    case 'verifying':
    case 'SEV3':
      return 'info'
    default:
      return 'neutral'
  }
}

const GLYPH: Record<Tone, string> = {
  ok: '●',
  warn: '▲',
  alarm: '■',
  info: '◆',
  neutral: '○',
}

export function StatusDot({ value, className = '' }: { value: string; className?: string }) {
  const tone = toneFor(value)
  return (
    <span aria-hidden className={`${TONE_TEXT[tone]} text-[7px] leading-none ${className}`}>
      {GLYPH[tone]}
    </span>
  )
}

/** A state, written out. Dot plus word, no container. */
export function Badge({
  value,
  label,
  tone,
  muted = false,
}: {
  value: string
  label?: string
  tone?: Tone
  muted?: boolean
}) {
  const resolved = tone ?? toneFor(value)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={`${TONE_TEXT[resolved]} text-[7px] leading-none`}>
        {GLYPH[resolved]}
      </span>
      <span
        className={`text-[12.5px] ${
          muted || resolved === 'neutral' ? 'text-ink-2' : TONE_TEXT[resolved]
        }`}
      >
        {(label ?? value).replace(/_/g, ' ')}
      </span>
    </span>
  )
}

/**
 * A titled region. Bordered by default because tabular content needs an edge;
 * pass bare for prose sections that only need a heading and whitespace.
 */
export function Card({
  title,
  hint,
  actions,
  children,
  className = '',
  bodyClass = 'px-4 py-3.5',
  bare = false,
}: {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
  bare?: boolean
}) {
  return (
    <section
      className={`min-w-0 ${bare ? '' : 'panel rounded-md border border-line'} ${className}`}
    >
      {(title || actions) && (
        <header
          className={`flex flex-wrap items-baseline justify-between gap-3 ${
            bare ? 'pb-2' : 'border-b border-line px-4 py-2.5'
          }`}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
            {title && <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>}
            {hint && <span className="text-[12.5px] text-ink-3">{hint}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
        </header>
      )}
      <div className={bare ? '' : bodyClass}>{children}</div>
    </section>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  title,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  icon?: ReactNode
}) {
  const variants = {
    primary: 'border-accent bg-accent text-white hover:bg-accent-hover',
    secondary: 'border-line-strong bg-page text-ink hover:bg-sunken',
    danger: 'border-line-strong bg-page text-alarm hover:bg-alarm-bg',
    ghost: 'border-transparent bg-transparent text-ink-2 hover:text-ink',
  }[variant]
  const sizing = size === 'sm' ? 'h-7 gap-1.5 px-2.5 text-[12.5px]' : 'h-8 gap-1.5 px-3 text-[13px]'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-sm border font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${variants} ${sizing}`}
    >
      {icon}
      {children}
    </button>
  )
}

/** A figure with its label. No box — whitespace separates it from its neighbour. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="min-w-0">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div
        className={`tnum mt-1 text-[22px] leading-tight font-medium ${
          tone === 'neutral' ? 'text-ink' : TONE_TEXT[tone]
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[12.5px] text-ink-3">{hint}</div>}
    </div>
  )
}

export function Metric({
  value,
  unit,
  threshold,
  breached,
  className = '',
}: {
  value: ReactNode
  unit?: string
  threshold?: ReactNode
  breached?: boolean
  className?: string
}) {
  return (
    <span className={`tnum whitespace-nowrap ${className}`}>
      <span className={breached ? 'text-alarm' : 'text-ink'}>{value}</span>
      {unit && <span className="ml-1 text-[11.5px] text-ink-3">{unit}</span>}
      {threshold !== undefined && (
        <span className="ml-1.5 text-[11.5px] text-ink-3">/ {threshold}</span>
      )}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="mt-0.5 truncate text-[13px] text-ink">{children}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode; icon?: ReactNode }) {
  return <p className="py-8 text-center text-[13px] text-ink-3">{children}</p>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

/* ------------------------------- formatters ------------------------------ */

export const fmtMs = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`

export const fmtPct = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`

export const fmtNum = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? '—' : v.toFixed(digits)

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour12: false })

export function fmtAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}
