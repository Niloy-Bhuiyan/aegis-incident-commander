import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useIncidents, useSystemStatus } from '../hooks/queries'
import { Badge, Kbd, StatusDot, fmtAgo } from './ui'

const NAV = [
  { to: '/', label: 'Command Center', key: 'c', end: true },
  { to: '/incidents', label: 'Investigations', key: 'i', end: false },
  { to: '/map', label: 'System Map', key: 'm', end: false },
  { to: '/knowledge', label: 'Knowledge Base', key: 'k', end: false },
  { to: '/lab', label: 'Demo Lab', key: 'l', end: false },
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
      className="flex items-center gap-1.5 text-[12.5px] text-ink-3"
      title={
        stale
          ? 'The console is not receiving fresh telemetry.'
          : 'Telemetry is current, polled every 2 seconds.'
      }
    >
      <span
        aria-hidden
        className={`inline-block h-[5px] w-[5px] rounded-full ${
          stale ? 'bg-warn' : 'bg-ok pulse-dot'
        }`}
      />
      {stale ? <span className="text-warn">Not updating</span> : <span>Updated live</span>}
      {updatedAt && !stale ? (
        <span className="tnum hidden xl:inline">
          {fmtAgo(new Date(updatedAt).toISOString())}
        </span>
      ) : null}
    </span>
  )
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-md border border-line bg-page p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-ink">Keyboard shortcuts</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-3">Press g, then a page key.</p>
        <dl className="mt-4 space-y-2.5">
          {NAV.map((item) => (
            <div key={item.to} className="flex items-center justify-between gap-6">
              <dt className="text-[13px] text-ink-2">{item.label}</dt>
              <dd className="flex gap-1">
                <Kbd>g</Kbd>
                <Kbd>{item.key}</Kbd>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-6 border-t border-line pt-2.5">
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
      <nav
        aria-label="Primary"
        className="hidden w-[228px] shrink-0 flex-col border-r border-line bg-page md:flex"
      >
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-accent" />
            <span className="text-[15px] font-semibold tracking-tight text-ink">Aegis</span>
          </div>
        </div>

        <div className="flex flex-col px-3">
          {NAV.map(({ to, label, end, key }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={`${label}  (g ${key})`}
              className={({ isActive }) =>
                `rounded-sm px-2.5 py-2 transition-colors duration-150 ${
                  isActive ? 'nav-active bg-sunken' : 'hover:bg-sunken'
                }`
              }
            >
              {({ isActive }) => (
                <span
                  className={`block text-[13.5px] ${
                    isActive ? 'font-semibold text-ink' : 'text-ink-2'
                  }`}
                >
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="mt-auto space-y-1 border-t border-line px-5 py-4 text-[12px] text-ink-3">
          <div className="flex justify-between">
            <span>Telemetry source</span>
            <span className="tnum text-ink-2">{status?.telemetry?.source ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Reasoning</span>
            <span className="tnum text-ink-2">{status?.model ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Knowledge</span>
            <span className="tnum text-ink-2">{status?.knowledge_chunks ?? '—'} chunks</span>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-page px-5 lg:px-8">
          <span className="text-[13.5px] font-semibold text-ink md:hidden">Aegis</span>

          <div className="flex items-center gap-2" data-testid="platform-status">
            <StatusDot value={status?.healthy ? 'healthy' : 'degraded'} />
            <span
              className={`text-[13px] ${status?.healthy ? 'text-ink-2' : 'font-medium text-alarm'}`}
            >
              {status ? (status.healthy ? 'healthy' : 'degraded') : '—'}
            </span>
          </div>

          {open > 0 && (
            <>
              <span className="text-ink-3">·</span>
              <Badge value="open" label={`${open} open incident${open > 1 ? 's' : ''}`} />
            </>
          )}

          {readOnly && (
            <>
              <span className="text-ink-3">·</span>
              <span className="text-[12.5px] text-ink-3">read only</span>
            </>
          )}

          <div className="ml-auto flex items-center gap-4">
            <LiveIndicator updatedAt={dataUpdatedAt} failed={isError} />
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
              className="transition-opacity duration-150 hover:opacity-60"
            >
              <Kbd>?</Kbd>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-5 py-7 lg:px-8 lg:py-9">
            <Outlet />
          </div>
        </main>
      </div>

      {showHelp && <ShortcutSheet onClose={() => setShowHelp(false)} />}
    </div>
  )
}
