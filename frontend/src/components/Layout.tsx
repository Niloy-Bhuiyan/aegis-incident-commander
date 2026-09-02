import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useIncidents, useSystemStatus } from '../hooks/queries'
import {
  IconBook,
  IconFlask,
  IconGauge,
  IconIncident,
  IconMap,
  IconShield,
} from './icons'
import { Badge, Kbd, StatusDot, fmtAgo } from './ui'

const NAV = [
  { to: '/', label: 'Command Center', key: 'c', end: true, Icon: IconGauge },
  { to: '/incidents', label: 'Investigations', key: 'i', end: false, Icon: IconIncident },
  { to: '/map', label: 'System Map', key: 'm', end: false, Icon: IconMap },
  { to: '/knowledge', label: 'Knowledge Base', key: 'k', end: false, Icon: IconBook },
  { to: '/lab', label: 'Demo Lab', key: 'l', end: false, Icon: IconFlask },
]

/** Poll cadence is 2s; anything older than three cycles is not "live". */
const STALE_AFTER_MS = 6000

function useKeyboardNav() {
  const navigate = useNavigate()
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    let awaitingGoto = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === '?') {
        setShowHelp((v) => !v)
        return
      }
      if (event.key === 'Escape') {
        setShowHelp(false)
        return
      }
      if (event.key === 'g') {
        awaitingGoto = true
        clearTimeout(timer)
        timer = setTimeout(() => {
          awaitingGoto = false
        }, 1200)
        return
      }
      if (awaitingGoto) {
        const match = NAV.find((item) => item.key === event.key)
        awaitingGoto = false
        if (match) {
          event.preventDefault()
          navigate(match.to)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [navigate])

  return { showHelp, setShowHelp }
}

function LiveIndicator({ updatedAt, failed }: { updatedAt: number; failed: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const age = updatedAt ? Date.now() - updatedAt : Infinity
  const stale = failed || age > STALE_AFTER_MS

  return (
    <span
      className="flex items-center gap-1.5 text-[11px]"
      title={
        stale
          ? 'The console is not receiving fresh telemetry.'
          : 'Telemetry is current, polled every 2 seconds.'
      }
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          stale ? 'bg-warn' : 'bg-ok pulse'
        }`}
      />
      <span className={stale ? 'text-warn' : 'text-fg-3'}>
        {stale ? 'stale' : 'live'}
        {updatedAt ? (
          <span className="tnum ml-1 text-fg-3">{fmtAgo(new Date(updatedAt).toISOString())}</span>
        ) : null}
      </span>
    </span>
  )
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-md border border-line-strong bg-surface p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-2">
          Keyboard shortcuts
        </h2>
        <dl className="mt-3 space-y-1.5">
          {NAV.map((item) => (
            <div key={item.to} className="flex items-center justify-between gap-4">
              <dt className="text-xs text-fg-2">{item.label}</dt>
              <dd className="flex gap-1">
                <Kbd>g</Kbd>
                <Kbd>{item.key}</Kbd>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t border-line pt-2">
            <dt className="text-xs text-fg-2">Toggle this sheet</dt>
            <dd>
              <Kbd>?</Kbd>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export function Layout() {
  const { data: status, dataUpdatedAt, isError } = useSystemStatus()
  const { data: incidents } = useIncidents()
  const { showHelp, setShowHelp } = useKeyboardNav()

  const open = (incidents ?? []).filter(
    (incident) => !['resolved', 'cancelled'].includes(incident.status),
  ).length

  const sourceKind = status?.telemetry?.source ?? '—'
  const readOnly = status?.telemetry?.supports_remediation === false

  return (
    <div className="flex h-full flex-col bg-base">
      {/* Status strip: the one line that is always true and always visible. */}
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <div className="flex items-center gap-2 pr-2">
          <IconShield size={16} className="text-info" />
          <span className="text-[13px] font-semibold tracking-tight">Aegis</span>
        </div>

        <div className="h-4 w-px bg-line" />

        <div
          className="flex items-center gap-1.5"
          data-testid="platform-status"
          title={status?.healthy ? 'All services inside SLO' : 'One or more services outside SLO'}
        >
          <StatusDot value={status?.healthy ? 'healthy' : 'degraded'} />
          <span className={`text-xs ${status?.healthy ? 'text-ok' : 'text-alarm'}`}>
            {status ? (status.healthy ? 'healthy' : 'degraded') : '—'}
          </span>
        </div>

        {open > 0 && (
          <Badge value="open" label={`${open} open incident${open > 1 ? 's' : ''}`} tone="alarm" />
        )}

        <div className="ml-auto flex items-center gap-3 text-[11px] text-fg-3">
          <LiveIndicator updatedAt={dataUpdatedAt} failed={isError} />
          <div className="hidden h-4 w-px bg-line sm:block" />
          <span className="hidden items-center gap-1 sm:flex" title="Telemetry source">
            <span className="text-fg-3">source</span>
            <span className="tnum text-fg-2">{sourceKind}</span>
            {readOnly && <Badge value="read_only" label="read only" tone="neutral" />}
          </span>
          <div className="hidden h-4 w-px bg-line lg:block" />
          <span className="hidden items-center gap-1 lg:flex" title="Reasoning provider">
            <span className="text-fg-3">reasoning</span>
            <span className="tnum text-fg-2">{status?.model ?? '—'}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="rounded-xs px-1 text-fg-3 transition-colors duration-150 hover:text-fg"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <Kbd>?</Kbd>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Primary"
          className="flex w-12 shrink-0 flex-col gap-0.5 border-r border-line bg-surface p-1.5 lg:w-[188px] lg:p-2"
        >
          {NAV.map(({ to, label, end, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={`${label}  (g ${key})`}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-xs transition-colors duration-150 ${
                  isActive
                    ? 'bg-info-dim text-info'
                    : 'text-fg-2 hover:bg-raised hover:text-fg'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? 'text-info' : 'text-fg-3'} />
                  <span className="hidden truncate lg:inline">{label}</span>
                  <span className="ml-auto hidden lg:inline">
                    <span className="text-[9px] text-fg-3 opacity-0 transition-opacity group-hover:opacity-100">
                      g {key}
                    </span>
                  </span>
                </>
              )}
            </NavLink>
          ))}

          <div className="mt-auto hidden space-y-1 border-t border-line pt-2 lg:block">
            <div className="flex items-center justify-between px-2 text-[10px] text-fg-3">
              <span>knowledge</span>
              <span className="tnum text-fg-2">{status?.knowledge_chunks ?? '—'} chunks</span>
            </div>
            <div className="flex items-center justify-between px-2 text-[10px] text-fg-3">
              <span>services</span>
              <span className="tnum text-fg-2">{status?.services.length ?? '—'}</span>
            </div>
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] p-3 lg:p-4">
            <Outlet />
          </div>
        </main>
      </div>

      {showHelp && <ShortcutSheet onClose={() => setShowHelp(false)} />}
    </div>
  )
}
