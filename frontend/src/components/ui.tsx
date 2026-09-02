import type { ReactNode } from 'react'

/* -------------------------------------------------------------------------
   Primitives.
   Hierarchy is carried by type scale and elevation; colour is reserved for
   meaning. Every status pairs a hue with a glyph and a word, so nothing
   depends on colour perception alone.
------------------------------------------------------------------------- */

export type Tone = 'ok' | 'warn' | 'alarm' | 'info' | 'brand' | 'neutral'

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  alarm: 'text-alarm',
  info: 'text-info',
  brand: 'text-brand',
  neutral: 'text-ink-3',
}

const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok border-ok-line',
  warn: 'bg-warn-bg text-warn border-warn-line',
  alarm: 'bg-alarm-bg text-alarm border-alarm-line',
  info: 'bg-info-bg text-info border-info-line',
  brand: 'bg-brand-soft text-brand-strong border-brand-line',
  neutral: 'bg-sunken text-ink-2 border-line-strong',
}

/** Single source of truth mapping domain states onto the palette. */
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
  brand: '◆',
  neutral: '○',
}

export function StatusDot({ value, className = '' }: { value: string; className?: string }) {
  const tone = toneFor(value)
  return (
    <span aria-hidden className={`${TONE_TEXT[tone]} text-[8px] leading-none ${className}`}>
      {GLYPH[tone]}
    </span>
  )
}

export function Badge({ value, label, tone }: { value: string; label?: string; tone?: Tone }) {
  const resolved = tone ?? toneFor(value)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11.5px] font-semibold whitespace-nowrap ${TONE_CHIP[resolved]}`}
    >
      <span aria-hidden className="text-[7px] leading-none">
        {GLYPH[resolved]}
      </span>
      {(label ?? value).replace(/_/g, ' ')}
    </span>
  )
}

export function Card({
  title,
  hint,
  actions,
  children,
  className = '',
  bodyClass = 'px-5 py-4',
  interactive = false,
  elevated = false,
}: {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
  interactive?: boolean
  elevated?: boolean
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-lg border border-line bg-card ${
        elevated ? 'shadow-3' : 'shadow-2'
      } ${interactive ? 'lift' : ''} ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/60 px-5 py-3.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            {title && <h2 className="text-[14.5px] font-bold text-ink">{title}</h2>}
            {hint && <span className="text-[12.5px] text-ink-3">{hint}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
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
  variant?: 'primary' | 'secondary' | 'approve' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  icon?: ReactNode
}) {
  const variants = {
    primary:
      'border-brand-strong bg-brand text-white shadow-2 hover:bg-brand-strong hover:shadow-3',
    secondary: 'border-line-strong bg-card text-ink shadow-1 hover:bg-sunken hover:shadow-2',
    approve: 'border-ok bg-ok text-white shadow-2 hover:brightness-110 hover:shadow-3',
    danger: 'border-alarm-line bg-card text-alarm shadow-1 hover:bg-alarm-bg',
    ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-sunken hover:text-ink',
  }[variant]
  const sizing = size === 'sm' ? 'h-8 gap-1.5 px-3 text-[12.5px]' : 'h-9.5 gap-2 px-4 text-[13px]'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg border font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${variants} ${sizing}`}
    >
      {icon}
      {children}
    </button>
  )
}

/** Headline figure. The number is the point, so it gets the weight. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  spark,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  spark?: ReactNode
}) {
  const accent = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    alarm: 'bg-alarm',
    info: 'bg-info',
    brand: 'bg-brand',
    neutral: 'bg-line-strong',
  }[tone]

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-card px-5 py-4 shadow-2">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] ${accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            {label}
          </div>
          <div
            className={`tnum mt-2 text-[28px] leading-none font-extrabold ${
              tone === 'neutral' ? 'text-ink' : TONE_TEXT[tone]
            }`}
          >
            {value}
          </div>
        </div>
        {spark && <div className="mt-1 shrink-0">{spark}</div>}
      </div>
      {hint && <div className="mt-2.5 text-[12.5px] text-ink-3">{hint}</div>}
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
      <span className={breached ? 'font-bold text-alarm' : 'font-semibold text-ink'}>{value}</span>
      {unit && <span className="ml-1 text-[11px] text-ink-3">{unit}</span>}
      {threshold !== undefined && (
        <span className="ml-1.5 text-[11px] text-ink-3">/ {threshold}</span>
      )}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-sunken px-3.5 py-2.5">
      <div className="text-[10.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-ink">{children}</div>
    </div>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-sunken px-6 py-12 text-center">
      {icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink-3 shadow-1">
          {icon}
        </span>
      )}
      <p className="max-w-sm text-[13px] leading-relaxed text-ink-3">{children}</p>
    </div>
  )
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
