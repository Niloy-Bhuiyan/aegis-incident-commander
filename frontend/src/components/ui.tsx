import type { ReactNode } from 'react'

/* -------------------------------------------------------------------------
   Primitives.
   Type carries the hierarchy, elevation carries the grouping, and colour is
   held back for meaning. Status always pairs a hue with a glyph and a word,
   so nothing depends on colour perception alone.
------------------------------------------------------------------------- */

export type Tone = 'ok' | 'warn' | 'alarm' | 'info' | 'neutral'

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  alarm: 'text-alarm',
  info: 'text-info',
  neutral: 'text-ink-3',
}

const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok border-ok-line',
  warn: 'bg-warn-bg text-warn border-warn-line',
  alarm: 'bg-alarm-bg text-alarm border-alarm-line',
  info: 'bg-info-bg text-info border-info-line',
  neutral: 'bg-sunken text-ink-2 border-line-strong',
}

/** Single source of truth mapping domain states onto the signal palette. */
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
    <span aria-hidden className={`${TONE_TEXT[tone]} text-[8px] leading-none ${className}`}>
      {GLYPH[tone]}
    </span>
  )
}

export function Badge({
  value,
  label,
  tone,
}: {
  value: string
  label?: string
  tone?: Tone
}) {
  const resolved = tone ?? toneFor(value)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${TONE_CHIP[resolved]}`}
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
}: {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
  interactive?: boolean
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-line bg-card shadow-sm ${
        interactive ? 'lift' : ''
      } ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            {title && <h2 className="text-[14px] font-semibold text-ink">{title}</h2>}
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
    primary: 'border-ink bg-ink text-white hover:bg-ink-2 shadow-xs',
    secondary: 'border-line-strong bg-card text-ink hover:bg-sunken shadow-xs',
    approve: 'border-ok bg-ok text-white hover:brightness-110 shadow-xs',
    danger: 'border-alarm-line bg-card text-alarm hover:bg-alarm-bg shadow-xs',
    ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-sunken hover:text-ink',
  }[variant]
  const sizing = size === 'sm' ? 'h-8 gap-1.5 px-3 text-[12.5px]' : 'h-9 gap-2 px-4 text-[13px]'
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

/** A headline figure. Large, confident, and quiet about its label. */
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
  const valueTone = tone === 'neutral' ? 'text-ink' : TONE_TEXT[tone]
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-4 shadow-xs">
      <div className="text-[12px] font-medium tracking-wide text-ink-3 uppercase">{label}</div>
      <div className={`tnum mt-1.5 text-[26px] leading-none font-bold ${valueTone}`}>{value}</div>
      {hint && <div className="mt-2 text-[12.5px] text-ink-3">{hint}</div>}
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
      <span className={breached ? 'font-semibold text-alarm' : 'font-medium text-ink'}>
        {value}
      </span>
      {unit && <span className="ml-1 text-[11px] text-ink-3">{unit}</span>}
      {threshold !== undefined && <span className="ml-1.5 text-[11px] text-ink-3">/ {threshold}</span>}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-sunken px-3.5 py-2.5">
      <div className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{label}</div>
      <div className="mt-1 truncate text-[13px] font-medium text-ink">{children}</div>
    </div>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-sunken/60 px-6 py-12 text-center">
      {icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-ink-3 shadow-xs">
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
