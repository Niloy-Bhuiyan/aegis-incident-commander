import { Link } from 'react-router-dom'

import { Badge, Empty, fmtAgo } from '../components/ui'
import { useIncidents } from '../hooks/queries'

export function Incidents() {
  const { data: incidents, isLoading } = useIncidents()
  const open = (incidents ?? []).filter((i) => !['resolved', 'cancelled'].includes(i.status))

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[21px] leading-tight font-semibold tracking-tight text-ink">
          Investigations
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          Every incident Aegis has opened, newest first.{' '}
          {isLoading ? '' : `${incidents?.length ?? 0} recorded, ${open.length} still open.`}
        </p>
      </header>

      {isLoading ? (
        <Empty>Loading…</Empty>
      ) : !incidents?.length ? (
        <Empty>No incidents yet. Inject a failure from the Demo Lab to see one end to end.</Empty>
      ) : (
        <ul className="border-t border-line" data-testid="incident-list">
          {incidents.map((incident) => (
            <li key={incident.id} className="border-b border-line">
              <Link
                to={`/incidents/${incident.id}`}
                className="block px-1 py-3.5 transition-colors duration-150 hover:bg-sunken"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                    {incident.title}
                  </span>
                  <Badge value={incident.severity} />
                  <span className="text-[12.5px] text-ink-3">
                    {incident.workflow_state.replace(/_/g, ' ')}
                  </span>
                  <Badge value={incident.status} />
                </div>
                <div className="tnum mt-1 text-[11.5px] text-ink-3">
                  #{incident.id} · {incident.service} · opened {fmtAgo(incident.opened_at)}
                  {incident.resolved_at ? ` · resolved ${fmtAgo(incident.resolved_at)}` : ''}
                </div>
                {incident.root_cause && (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                    {incident.root_cause}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
