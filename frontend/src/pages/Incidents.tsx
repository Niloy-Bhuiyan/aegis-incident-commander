import { Link } from 'react-router-dom'

import { IconIncident } from '../components/icons'
import { Badge, Card, Empty, fmtAgo } from '../components/ui'
import { useIncidents } from '../hooks/queries'

export function Incidents() {
  const { data: incidents, isLoading } = useIncidents()
  const open = (incidents ?? []).filter((i) => !['resolved', 'cancelled'].includes(i.status))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">
          Investigations
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-3">
          {isLoading
            ? 'Loading…'
            : `${incidents?.length ?? 0} recorded · ${open.length} open`}
        </p>
      </header>

      <Card bodyClass="p-3">
        {isLoading ? (
          <Empty>Loading…</Empty>
        ) : !incidents?.length ? (
          <Empty icon={<IconIncident size={17} />}>
            No incidents yet. Inject a failure from the Demo Lab to watch the full investigation
            run.
          </Empty>
        ) : (
          <ul className="space-y-2" data-testid="incident-list">
            {incidents.map((incident) => (
              <li key={incident.id}>
                <Link
                  to={`/incidents/${incident.id}`}
                  className="lift block rounded-lg border border-line bg-card px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Badge value={incident.severity} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                      {incident.title}
                    </span>
                    <Badge value={incident.workflow_state} tone="neutral" />
                    <Badge value={incident.status} />
                  </div>
                  <div className="tnum mt-1.5 text-[11.5px] text-ink-3">
                    #{incident.id} · {incident.service} · {incident.detector} · opened{' '}
                    {fmtAgo(incident.opened_at)}
                    {incident.resolved_at ? ` · resolved ${fmtAgo(incident.resolved_at)}` : ''}
                  </div>
                  {incident.root_cause && (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
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
