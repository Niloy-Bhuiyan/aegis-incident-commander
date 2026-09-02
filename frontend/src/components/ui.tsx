import type { ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-xl border border-ink-800 bg-ink-900/70 shadow-lg shadow-black/20 ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-ink-800 px-5 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-mist-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-mist-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

const STATUS_STYLES: Record<string, string> = {
  healthy: 'bg-ok-500/10 text-ok-500 border-ok-500/30',
  degraded: 'bg-alarm-500/10 text-alarm-500 border-alarm-500/30',
  unknown: 'bg-ink-700/40 text-mist-400 border-ink-600',
  resolved: 'bg-ok-500/10 text-ok-500 border-ok-500/30',
  cancelled: 'bg-ink-700/40 text-mist-400 border-ink-600',
  investigating: 'bg-signal-500/10 text-signal-500 border-signal-500/30',
  awaiting_approval: 'bg-warn-500/10 text-warn-500 border-warn-500/30',
  remediating: 'bg-signal-500/10 text-signal-500 border-signal-500/30',
  verifying: 'bg-signal-500/10 text-signal-500 border-signal-500/30',
  open: 'bg-warn-500/10 text-warn-500 border-warn-500/30',
  failed: 'bg-alarm-500/10 text-alarm-500 border-alarm-500/30',
  SEV1: 'bg-alarm-600/15 text-alarm-500 border-alarm-500/40',
  SEV2: 'bg-warn-500/10 text-warn-500 border-warn-500/30',
  SEV3: 'bg-signal-500/10 text-signal-500 border-signal-500/30',
  high: 'bg-alarm-500/10 text-alarm-500 border-alarm-500/30',
  medium: 'bg-warn-500/10 text-warn-500 border-warn-500/30',
  low: 'bg-ok-500/10 text-ok-500 border-ok-500/30',
  supported: 'bg-ok-500/10 text-ok-500 border-ok-500/30',
  partially_supported: 'bg-warn-500/10 text-warn-500 border-warn-500/30',
  unsupported: 'bg-alarm-500/10 text-alarm-500 border-alarm-500/30',
  contradicted: 'bg-alarm-600/15 text-alarm-500 border-alarm-500/40',
}

export function Pill({ value, label }: { value: string; label?: string }) {
  const style = STATUS_STYLES[value] ?? 'bg-ink-700/40 text-mist-300 border-ink-600'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${style}`}
    >
      {(label ?? value).replace(/_/g, ' ')}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'alarm' | 'ok'
}) {
  const toneClass =
    tone === 'alarm' ? 'text-alarm-500' : tone === 'ok' ? 'text-ok-500' : 'text-mist-100'
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-850/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mist-400">{label}</div>
      <div className={`mt-1 font-mono text-xl ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-mist-400">{hint}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center text-sm text-mist-400">
      {children}
    </p>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
  title?: string
}) {
  const styles = {
    default: 'border-ink-600 bg-ink-800 text-mist-100 hover:bg-ink-700',
    primary: 'border-ok-500/40 bg-ok-500/15 text-ok-500 hover:bg-ok-500/25',
    danger: 'border-alarm-500/40 bg-alarm-500/10 text-alarm-500 hover:bg-alarm-500/20',
  }[variant]
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  )
}

export const fmtMs = (v: number | null | undefined) =>
  v === null || v === undefined ? '--' : `${v.toFixed(0)}ms`

export const fmtPct = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? '--' : `${(v * 100).toFixed(digits)}%`

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour12: false })
