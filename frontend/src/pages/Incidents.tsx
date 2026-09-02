import { Link } from 'react-router-dom'

import { Card, Empty, Pill, fmtTime } from '../components/ui'
import { useIncidents } from '../hooks/queries'

export function Incidents() {
  const { data: incidents, isLoading } = useIncidents()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Investigations</h1>
        <p className="mt-1 text-sm text-mist-400">
          Every incident Aegis has opened, with the state of its workflow.
        </p>
      </header>

      <Card>
        {isLoading ? (
          <Empty>Loading.</Empty>
        ) : !incidents?.length ? (
          <Empty>No incidents yet. Inject a failure from the Demo Lab.</Empty>
        ) : (
          <ul className="space-y-2" data-testid="incident-list">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  to={`/incidents/${incident.id}`}
                  className="block rounded-lg border border-ink-800 bg-ink-850/50 px-4 py-3 transition hover:border-ink-600"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-mist-100">{incident.title}</div>
                      <div className="mt-0.5 text-[11px] text-mist-400">
                        #{incident.id} · {incident.service} · detected by {incident.detector} ·{' '}
                        {fmtTime(incident.opened_at)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Pill value={incident.severity} />
                      <Pill value={incident.workflow_state} />
                      <Pill value={incident.status} />
                    </div>
                  </div>
                  {incident.root_cause && (
                    <p className="mt-2 text-xs leading-relaxed text-mist-300">
                      {incident.root_cause}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
