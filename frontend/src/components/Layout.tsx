import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useIncidents, useSystemStatus } from '../hooks/queries'
import { IconBook, IconFlask, IconGauge, IconIncident, IconMap, IconShield } from './icons'
import { Badge, Kbd, StatusDot, fmtAgo } from './ui'

const NAV = [
  { to: '/', label: 'Command Center', key: 'c', end: true, Icon: IconGauge },
  { to: '/incidents', label: 'Investigations', key: 'i', end: false, Icon: IconIncident },
  { to: '/map', label: 'System Map', key: 'm', end: false, Icon: IconMap },
  { to: '/knowledge', label: 'Knowledge Base', key: 'k', end: false, Icon: IconBook },
  { to: '/lab', label: 'Demo Lab', key: 'l', end: false, Icon: IconFlask },
]

/** Telemetry polls every 2s; three missed cycles is no longer "live". */
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

      if (event.key === '?') return setShowHelp((v) => !v)
      if (event.key === 'Escape') return setShowHelp(false)
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

  const stale = failed || !updatedAt || Date.now() - updatedAt > STALE_AFTER_MS

  return (
    <span
      className="flex items-center gap-2 text-[12.5px]"
      title={
        stale
          ? 'The console is not receiving fresh telemetry.'
          : 'Telemetry is current, polled every 2 seconds.'
      }
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${stale ? 'bg-warn' : 'bg-ok pulse-dot'}`}
      />
      <span className={stale ? 'font-semibold text-warn' : 'font-medium text-ink-2'}>
        {stale ? 'Stale' : 'Live'}
      </span>
      {updatedAt ? (
        <span className="tnum hidden text-[11.5px] text-ink-3 xl:inline">
          {fmtAgo(new Date(updatedAt).toISOString())}
        </span>
      ) : null}
    </span>
  )
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-line bg-card p-6 shadow-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-[16px] font-bold text-ink">Keyboard shortcuts</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">Press g, then a page key.</p>
        <dl className="mt-5 space-y-3">
          {NAV.map((item) => (
            <div key={item.to} className="flex items-center justify-between gap-6">
              <dt className="text-[13px] text-ink-2">{item.label}</dt>
              <dd className="flex gap-1.5">
                <Kbd>g</Kbd>
                <Kbd>{item.key}</Kbd>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-6 border-t border-line pt-3">
            <dt className="text-[13px] text-ink-2">Toggle this sheet</dt>
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

  const readOnly = status?.telemetry?.supports_remediation === false

  return (
    <div className="flex h-full bg-canvas">
      {/* Deep navigation rail: anchors the layout and gives the product a face. */}
      <nav
        aria-label="Primary"
        className="flex w-[72px] shrink-0 flex-col bg-rail lg:w-[248px]"
      >
        <div className="flex h-16 items-center gap-3 px-4 lg:px-5">
          <span className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-white">
            <IconShield size={18} />
          </span>
          <span className="hidden min-w-0 lg:block">
            <span className="block text-[15px] leading-tight font-extrabold tracking-tight text-white">
              Aegis
            </span>
            <span className="block truncate text-[11px] text-rail-fg-2">Incident Commander</span>
          </span>
        </div>

        <div className="mx-4 mb-3 hidden h-px bg-rail-line lg:block" />

        <div className="flex flex-col gap-1 px-3 lg:px-4">
          {NAV.map(({ to, label, end, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={`${label}  (g ${key})`}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors duration-200 ${
                  isActive
                    ? 'rail-active font-semibold text-white'
                    : 'font-medium text-rail-fg-2 hover:bg-rail-2 hover:text-rail-fg'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} className={isActive ? 'text-white' : 'text-rail-fg-2'} />
                  <span className="hidden truncate lg:inline">{label}</span>
                  <span className="ml-auto hidden font-mono text-[10.5px] text-rail-fg-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 lg:inline">
                    g {key}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="mt-auto hidden p-4 lg:block">
          <div className="rounded-lg border border-rail-line bg-rail-2 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-rail-fg-2">Knowledge</span>
              <span className="tnum text-[11.5px] font-semibold text-rail-fg">
                {status?.knowledge_chunks ?? '—'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11.5px] text-rail-fg-2">Services</span>
              <span className="tnum text-[11.5px] font-semibold text-rail-fg">
                {status?.services.length ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-card px-5 shadow-1 lg:px-7">
          <div className="flex items-center gap-2.5" data-testid="platform-status">
            <StatusDot value={status?.healthy ? 'healthy' : 'degraded'} />
            <span
              className={`text-[13.5px] font-bold ${status?.healthy ? 'text-ok' : 'text-alarm'}`}
            >
              {status ? (status.healthy ? 'healthy' : 'degraded') : '—'}
            </span>
          </div>

          {open > 0 && (
            <Badge value="open" label={`${open} open incident${open > 1 ? 's' : ''}`} tone="alarm" />
          )}

          <div className="ml-auto flex items-center gap-4">
            <LiveIndicator updatedAt={dataUpdatedAt} failed={isError} />
            <span className="hidden h-5 w-px bg-line md:block" />
            <span className="hidden items-center gap-2 md:flex" title="Telemetry source">
              <span className="text-[12px] text-ink-3">Source</span>
              <span className="tnum text-[12px] font-semibold text-ink-2">
                {status?.telemetry?.source ?? '—'}
              </span>
            </span>
            {readOnly && <Badge value="read_only" label="read only" tone="neutral" />}
            <span className="hidden h-5 w-px bg-line lg:block" />
            <span className="hidden items-center gap-2 lg:flex" title="Reasoning provider">
              <span className="text-[12px] text-ink-3">Reasoning</span>
              <span className="tnum text-[12px] font-semibold text-ink-2">
                {status?.model ?? '—'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
              className="rounded-md transition-opacity duration-200 hover:opacity-70"
            >
              <Kbd>?</Kbd>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1480px] px-5 py-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {showHelp && <ShortcutSheet onClose={() => setShowHelp(false)} />}
    </div>
  )
}
