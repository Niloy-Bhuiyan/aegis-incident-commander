import { Link } from 'react-router-dom'

import { IconIncident } from '../components/icons'
import { Badge, Empty, Panel, StatusDot, fmtAgo } from '../components/ui'
import { useIncidents } from '../hooks/queries'

export function Incidents() {
  const { data: incidents, isLoading } = useIncidents()
  const open = (incidents ?? []).filter((i) => !['resolved', 'cancelled'].includes(i.status))

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Investigations</h1>
        <p className="text-[11px] text-fg-3">
          {isLoading
            ? 'Loading…'
            : `${incidents?.length ?? 0} total · ${open.length} open`}
        </p>
      </div>

      <Panel bodyClass="p-2">
        {isLoading ? (
          <Empty>Loading…</Empty>
        ) : !incidents?.length ? (
          <Empty icon={<IconIncident size={18} />}>
            No incidents yet. Inject a failure from the Demo Lab.
          </Empty>
        ) : (
          <ul className="space-y-1" data-testid="incident-list">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  to={`/incidents/${incident.id}`}
                  className="block rounded-sm border border-line bg-raised px-2.5 py-2 transition-colors duration-150 hover:border-line-strong hover:bg-hover"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusDot value={incident.severity} />
                    <span className="tnum shrink-0 text-[10px] text-fg-3">#{incident.id}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-fg">
                      {incident.title}
                    </span>
                    <Badge value={incident.severity} />
                    <Badge value={incident.workflow_state} tone="neutral" />
                    <Badge value={incident.status} />
                  </div>
                  <div className="tnum mt-0.5 pl-5 text-[10px] text-fg-3">
                    {incident.service} · {incident.detector} · opened {fmtAgo(incident.opened_at)}
                    {incident.resolved_at ? ` · resolved ${fmtAgo(incident.resolved_at)}` : ''}
                  </div>
                  {incident.root_cause && (
                    <p className="mt-1 pl-5 text-[11px] leading-snug text-fg-2">
                      {incident.root_cause}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
