import { Link, useNavigate } from 'react-router-dom'

import type { IncidentSummary, MetricPoint, ServiceHealth } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { Sparkline } from '../components/Sparkline'
import {
  Badge,
  Button,
  Card,
  Empty,
  Metric,
  Stat,
  fmtAgo,
  fmtMs,
  fmtNum,
  fmtPct,
} from '../components/ui'
import {
  useAllServiceMetrics,
  useChanges,
  useIncidents,
  useServiceMetrics,
  useSystemStatus,
} from '../hooks/queries'

/**
 * The one line that tells a first-time visitor what is happening and what to do
 * about it. The only element on the page allowed a tinted background.
 */
function NextStep({ incident, healthy }: { incident?: IncidentSummary; healthy: boolean }) {
  const navigate = useNavigate()

  if (incident) {
    const waiting = incident.workflow_state === 'awaiting_approval'
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-alarm-bg px-4 py-3">
        <p className="min-w-0 text-[13px] leading-relaxed text-ink">
          <span className="font-medium">{incident.title}.</span>{' '}
          <span className="text-ink-2">
            {waiting
              ? 'Aegis has finished investigating and is waiting for you to approve or reject its proposed fix.'
              : `Aegis is working through this incident — currently ${incident.workflow_state.replace(
                  /_/g,
                  ' ',
                )}.`}
          </span>
        </p>
        <Button variant="primary" onClick={() => navigate(`/incidents/${incident.id}`)}>
          {waiting ? 'Review the fix' : 'Open investigation'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-sunken px-4 py-3">
      <p className="text-[13px] leading-relaxed text-ink-2">
        {healthy
          ? 'Nothing is wrong right now. Break something to watch Aegis detect it, investigate, and propose a fix.'
          : 'A service is outside its SLO. Aegis opens an incident once the breach holds for three samples.'}
      </p>
      <Button variant="primary" onClick={() => navigate('/lab')}>
        Open Demo Lab
      </Button>
    </div>
  )
}

function ServiceRow({ service, series }: { service: ServiceHealth; series: MetricPoint[] }) {
  const latencyBreached =
    service.latency_p95_ms !== null && service.latency_p95_ms > service.slo_latency_p95_ms
  const errorBreached = service.error_rate !== null && service.error_rate > service.slo_error_rate

  return (
    <tr data-testid={`service-${service.name}`} className="border-t border-line">
      <td className="py-2.5 pr-3 pl-4">
        <div className="text-[13px] whitespace-nowrap text-ink">{service.name}</div>
        <div className="text-[11.5px] text-ink-3">{service.tier}</div>
      </td>
      <td className="hidden px-3 py-2.5 md:table-cell">
        <Sparkline
          values={series.map((p) => p.latency_p95_ms)}
          threshold={service.slo_latency_p95_ms}
          label={`${service.name} p95 latency trend`}
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <Metric
          value={fmtMs(service.latency_p95_ms)}
          threshold={fmtMs(service.slo_latency_p95_ms)}
          breached={latencyBreached}
          className="text-[13px]"
        />
      </td>
      <td className="px-3 py-2.5 text-right">
        <Metric
          value={fmtPct(service.error_rate)}
          threshold={fmtPct(service.slo_error_rate, 1)}
          breached={errorBreached}
          className="text-[13px]"
        />
      </td>
      <td className="hidden px-3 py-2.5 text-right lg:table-cell">
        <Metric value={fmtNum(service.saturation)} className="text-[13px]" />
      </td>
      <td className="py-2.5 pr-4 pl-3 text-right">
        <span title={service.breaches.join('\n') || 'Inside every SLO'}>
          <Badge value={service.status} />
        </span>
      </td>
    </tr>
  )
}

export function CommandCenter() {
  const { data: status, isLoading } = useSystemStatus()
  const { data: incidents } = useIncidents()
  const { data: changes } = useChanges()
  const { data: allMetrics } = useAllServiceMetrics()

  const active = (incidents ?? []).filter(
    (incident) => !['resolved', 'cancelled'].includes(incident.status),
  )
  const focusService = active[0]?.service ?? 'gateway'
  const { data: focusMetrics } = useServiceMetrics(focusService)
  const focus = status?.services.find((s) => s.name === focusService)
  const degraded = (status?.services ?? []).filter((s) => s.status === 'degraded')
  const total = status?.services.length ?? 0

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">
          Command Center
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          {total || 'Six'} services, sampled every two seconds. An incident opens automatically when
          a service stays outside its SLO for three consecutive samples.
        </p>
      </header>

      <NextStep incident={active[0]} healthy={Boolean(status?.healthy)} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-b border-line pb-6 sm:grid-cols-4">
        <Stat
          label="Services inside SLO"
          value={isLoading ? '—' : `${total - degraded.length}/${total}`}
          tone={degraded.length ? 'alarm' : 'ok'}
          hint={
            degraded.length
              ? `${degraded.length} of ${total} services outside SLO`
              : 'All within budget'
          }
        />
        <Stat
          label="Open incidents"
          value={active.length}
          tone={active.length ? 'alarm' : 'neutral'}
          hint={active.length ? active[0].service : 'None'}
        />
        <Stat
          label={`${focusService} p95`}
          value={fmtMs(focus?.latency_p95_ms ?? null)}
          hint={`SLO ${fmtMs(focus?.slo_latency_p95_ms)}`}
        />
        <Stat
          label={`${focusService} errors`}
          value={fmtPct(focus?.error_rate ?? null)}
          hint={`SLO ${fmtPct(focus?.slo_error_rate, 1)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Services" hint="latest sample against SLO" bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="text-[11.5px] text-ink-3">
                  <th className="py-2 pr-3 pl-4 text-left font-normal">Service</th>
                  <th className="hidden px-3 py-2 text-left font-normal md:table-cell">Trend</th>
                  <th className="px-3 py-2 text-right font-normal">Latency</th>
                  <th className="px-3 py-2 text-right font-normal">Errors</th>
                  <th className="hidden px-3 py-2 text-right font-normal lg:table-cell">
                    Saturation
                  </th>
                  <th className="py-2 pr-4 pl-3 text-right font-normal">State</th>
                </tr>
              </thead>
              <tbody>
                {(status?.services ?? []).map((service) => (
                  <ServiceRow
                    key={service.name}
                    service={service}
                    series={allMetrics?.[service.name] ?? []}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={focusService} hint="p95 latency">
          {focusMetrics?.length ? (
            <MetricChart
              data={focusMetrics}
              metric="latency_p95_ms"
              slo={focus?.slo_latency_p95_ms}
              height={150}
            />
          ) : (
            <Empty>Waiting for telemetry.</Empty>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card
          bare
          title="Incidents"
          actions={
            incidents?.length ? (
              <Link
                to="/incidents"
                className="text-[12.5px] text-ink-3 transition-colors duration-150 hover:text-ink"
              >
                View all
              </Link>
            ) : null
          }
        >
          {!incidents?.length ? (
            <Empty>
              No incidents yet. Inject a failure from the Demo Lab to see one from end to end.
            </Empty>
          ) : (
            <ul className="border-t border-line" data-testid="incident-list">
              {incidents.slice(0, 5).map((incident) => (
                <li key={incident.id} className="border-b border-line">
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="flex items-center gap-3 px-1 py-2.5 transition-colors duration-150 hover:bg-sunken"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{incident.title}</span>
                      <span className="tnum block text-[11.5px] text-ink-3">
                        #{incident.id} · {incident.service} · {fmtAgo(incident.opened_at)}
                      </span>
                    </span>
                    <Badge value={incident.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card bare title="Recent changes" hint="deploys, config and capacity events">
          {!changes?.length ? (
            <Empty>No changes recorded.</Empty>
          ) : (
            <ul className="border-t border-line">
              {changes.slice(0, 4).map((change) => (
                <li key={change.id} className="border-b border-line py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <code className="tnum truncate text-[12.5px] text-ink">{change.version}</code>
                    <span className="shrink-0 text-[11.5px] text-ink-3">
                      {change.kind.replace(/_/g, ' ')} · {change.risk} risk
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">
                    {change.change_summary}
                  </p>
                  <p className="tnum mt-0.5 text-[11.5px] text-ink-3">
                    {change.service} · {fmtAgo(change.ts)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
