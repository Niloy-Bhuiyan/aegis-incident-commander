import { NavLink, Outlet } from 'react-router-dom'

import { useSystemStatus } from '../hooks/queries'
import { Pill } from './ui'

const NAV = [
  { to: '/', label: 'Command Center', end: true },
  { to: '/incidents', label: 'Investigations', end: false },
  { to: '/map', label: 'System Map', end: false },
  { to: '/knowledge', label: 'Knowledge Base', end: false },
  { to: '/lab', label: 'Demo Lab', end: false },
]

export function Layout() {
  const { data: status } = useSystemStatus()

  return (
    <div className="flex min-h-full bg-ink-950">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/60">
        <div className="border-b border-ink-800 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-signal-500" />
            <span className="text-lg font-semibold tracking-tight">Aegis</span>
          </div>
          <p className="mt-1 text-[11px] leading-tight text-mist-400">
            Autonomous incident commander
          </p>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-signal-500/10 text-signal-400'
                    : 'text-mist-300 hover:bg-ink-800 hover:text-mist-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-ink-800 p-4 text-[11px] text-mist-400">
          <div className="flex items-center justify-between">
            <span>Platform</span>
            <Pill value={status?.healthy ? 'healthy' : 'degraded'} />
          </div>
          <div className="flex items-center justify-between">
            <span>Reasoning</span>
            <span className="font-mono text-mist-300">{status?.provider ?? '--'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Model</span>
            <span className="font-mono text-mist-300">{status?.model ?? '--'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>KB chunks</span>
            <span className="font-mono text-mist-300">{status?.knowledge_chunks ?? '--'}</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1400px] px-8 py-7">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
