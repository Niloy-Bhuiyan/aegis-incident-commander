import type { ReactNode } from 'react'

/* -------------------------------------------------------------------------
   Primitives for a dense operations console.
   Status is never conveyed by colour alone: every state carries a glyph and a
   word as well as a hue.
------------------------------------------------------------------------- */

export type Tone = 'ok' | 'warn' | 'alarm' | 'info' | 'neutral'

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  alarm: 'text-alarm',
  info: 'text-info',
  neutral: 'text-fg-2',
}

const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-ok-dim text-ok border-ok/25',
  warn: 'bg-warn-dim text-warn border-warn/25',
  alarm: 'bg-alarm-dim text-alarm border-alarm/25',
  info: 'bg-info-dim text-info border-info/25',
  neutral: 'bg-raised text-fg-2 border-line-strong',
}

/** Maps every domain state we render to a tone. Single source of truth. */
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
  ok: '●', // filled circle
  warn: '▲', // triangle
  alarm: '■', // filled square
  info: '◆', // diamond
  neutral: '○', // hollow circle
}

export function StatusDot({ value, className = '' }: { value: string; className?: string }) {
  const tone = toneFor(value)
  return (
    <span
      aria-hidden
      className={`${TONE_TEXT[tone]} text-[9px] leading-none ${className}`}
    >
      {GLYPH[tone]}
    </span>
  )
}

export function Badge({
  value,
  label,
  tone,
  mono = false,
}: {
  value: string
  label?: string
  tone?: Tone
  mono?: boolean
}) {
  const resolved = tone ?? toneFor(value)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-[2px] text-[10.5px] font-medium tracking-wide whitespace-nowrap ${
        TONE_CHIP[resolved]
      } ${mono ? 'font-mono' : ''}`}
    >
      <span aria-hidden className="text-[8px] leading-none">
        {GLYPH[resolved]}
      </span>
      {(label ?? value).replace(/_/g, ' ')}
    </span>
  )
}

export function Panel({
  title,
  hint,
  actions,
  children,
  className = '',
  bodyClass = 'p-3',
}: {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <section
      className={`min-w-0 rounded-md border border-line bg-surface ${className}`}
    >
      {(title || actions) && (
        <header className="flex min-h-9 items-center justify-between gap-3 border-b border-line px-3 py-1.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {title && (
              <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-2">
                {title}
              </h2>
            )}
            {hint && <span className="truncate text-[11px] text-fg-3">{hint}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  title,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'approve' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  icon?: ReactNode
}) {
  const variants = {
    default: 'border-line-strong bg-raised text-fg hover:bg-hover',
    approve: 'border-ok/40 bg-ok-dim text-ok hover:bg-ok/20',
    danger: 'border-alarm/40 bg-alarm-dim text-alarm hover:bg-alarm/20',
    ghost: 'border-transparent bg-transparent text-fg-2 hover:bg-raised hover:text-fg',
  }[variant]
  const sizing = size === 'sm' ? 'h-6 px-2 text-[11px] gap-1' : 'h-8 px-3 text-xs gap-1.5'
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

/** A metric with its unit, and an optional threshold it is measured against. */
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
      <span className={breached ? 'font-semibold text-alarm' : 'text-fg'}>{value}</span>
      {unit && <span className="ml-0.5 text-[10px] text-fg-3">{unit}</span>}
      {threshold !== undefined && (
        <span className="ml-1 text-[10px] text-fg-3">/ {threshold}</span>
      )}
    </span>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-sm border border-dashed border-line px-4 py-7 text-center">
      {icon && <span className="text-fg-3">{icon}</span>}
      <p className="max-w-sm text-xs text-fg-3">{children}</p>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-sm border border-line bg-raised px-2 py-1.5">
      <div className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-fg-3">{label}</div>
      <div className="mt-0.5 truncate text-xs text-fg">{children}</div>
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
