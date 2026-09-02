import { Link } from 'react-router-dom'

import type { MetricPoint, ServiceHealth } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { Sparkline } from '../components/Sparkline'
import { IconCommit, IconIncident, TierIcon } from '../components/icons'
import {
  Badge,
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

function ServiceRow({ service, series }: { service: ServiceHealth; series: MetricPoint[] }) {
  const latencyBreached =
    service.latency_p95_ms !== null && service.latency_p95_ms > service.slo_latency_p95_ms
  const errorBreached = service.error_rate !== null && service.error_rate > service.slo_error_rate
  const saturationBreached = service.saturation !== null && service.saturation > 0.92

  return (
    <tr
      data-testid={`service-${service.name}`}
      className="border-t border-line transition-colors duration-200 hover:bg-sunken/70"
    >
      <td className="py-3.5 pr-3 pl-5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken text-ink-3">
            <TierIcon tier={service.tier} size={15} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {service.name}
            </span>
            <span className="block text-[11.5px] text-ink-3">{service.tier}</span>
          </span>
        </div>
      </td>
      <td className="hidden px-3 py-3.5 md:table-cell">
        <Sparkline
          values={series.map((p) => p.latency_p95_ms)}
          threshold={service.slo_latency_p95_ms}
          label={`${service.name} p95 latency trend`}
        />
      </td>
      <td className="px-3 py-3.5 text-right">
        <Metric
          value={fmtMs(service.latency_p95_ms)}
          threshold={fmtMs(service.slo_latency_p95_ms)}
          breached={latencyBreached}
          className="text-[13px]"
        />
      </td>
      <td className="px-3 py-3.5 text-right">
        <Metric
          value={fmtPct(service.error_rate)}
          threshold={fmtPct(service.slo_error_rate, 1)}
          breached={errorBreached}
          className="text-[13px]"
        />
      </td>
      <td className="hidden px-3 py-3.5 text-right lg:table-cell">
        <Metric
          value={fmtNum(service.saturation)}
          breached={saturationBreached}
          className="text-[13px]"
        />
      </td>
      <td className="py-3.5 pr-5 pl-3 text-right">
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
  const gateway = status?.services.find((s) => s.name === 'gateway')
  const degraded = (status?.services ?? []).filter((s) => s.status === 'degraded')
  const healthyCount = (status?.services ?? []).length - degraded.length

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">
            Command Center
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            {isLoading
              ? 'Connecting to telemetry…'
              : degraded.length
                ? `${degraded.length} of ${status?.services.length} services outside SLO`
                : `All ${status?.services.length ?? 0} services inside SLO`}
          </p>
        </div>
        {active.length > 0 && (
          <Link
            to={`/incidents/${active[0].id}`}
            className="lift flex max-w-full items-center gap-3 rounded-lg border border-alarm-line bg-alarm-bg px-4 py-2.5"
          >
            <IconIncident size={16} className="shrink-0 text-alarm" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-alarm">
                {active[0].title}
              </span>
              <span className="block text-[11.5px] text-alarm/80">
                {active[0].workflow_state.replace(/_/g, ' ')} · opened{' '}
                {fmtAgo(active[0].opened_at)}
              </span>
            </span>
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Platform"
          value={isLoading ? '—' : status?.healthy ? 'Healthy' : 'Degraded'}
          tone={status?.healthy ? 'ok' : 'alarm'}
          hint={`${healthyCount} of ${status?.services.length ?? 0} services inside SLO`}
        />
        <Stat
          label="Open incidents"
          value={active.length}
          tone={active.length ? 'alarm' : 'ok'}
          hint={active.length ? active[0].service : 'Nothing open'}
        />
        <Stat
          label="Gateway p95"
          value={fmtMs(gateway?.latency_p95_ms ?? null)}
          tone={
            gateway?.latency_p95_ms && gateway.latency_p95_ms > gateway.slo_latency_p95_ms
              ? 'alarm'
              : 'neutral'
          }
          hint={`SLO ${fmtMs(gateway?.slo_latency_p95_ms)}`}
        />
        <Stat
          label="Gateway errors"
          value={fmtPct(gateway?.error_rate ?? null)}
          tone={
            gateway?.error_rate && gateway.error_rate > gateway.slo_error_rate
              ? 'alarm'
              : 'neutral'
          }
          hint={`SLO ${fmtPct(gateway?.slo_error_rate, 1)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_336px]">
        <Card
          title="Services"
          hint="latest sample against SLO"
          bodyClass="p-0"
          actions={
            status ? (
              <span className="tnum text-[12px] text-ink-3">
                {healthyCount}/{status.services.length} healthy
              </span>
            ) : null
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse">
              <thead>
                <tr className="text-[11px] tracking-[0.06em] text-ink-3 uppercase">
                  <th className="py-2.5 pr-3 pl-5 text-left font-semibold">Service</th>
                  <th className="hidden px-3 py-2.5 text-left font-semibold md:table-cell">Trend</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Latency</th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Errors</th>
                  <th className="hidden px-3 py-2.5 text-right font-semibold whitespace-nowrap lg:table-cell">
                    Saturation
                  </th>
                  <th className="py-2.5 pr-5 pl-3 text-right font-semibold">State</th>
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
              height={172}
            />
          ) : (
            <Empty>Waiting for telemetry.</Empty>
          )}
          {focus && (
            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-line pt-4">
              {[
                ['p50', fmtMs(focus.latency_p50_ms)],
                ['req/s', focus.rps?.toFixed(0) ?? '—'],
                ['saturation', fmtNum(focus.saturation)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">
                    {label}
                  </div>
                  <div className="tnum mt-1 text-[15px] font-semibold text-ink">{value}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title="Incidents"
          hint="newest first"
          bodyClass="p-3"
          actions={
            <Link
              to="/incidents"
              className="text-[12.5px] font-medium text-ink-3 transition-colors duration-200 hover:text-ink"
            >
              View all
            </Link>
          }
        >
          {!incidents?.length ? (
            <Empty icon={<IconIncident size={17} />}>
              No incidents recorded. Inject a failure from the Demo Lab to watch the full
              investigation run.
            </Empty>
          ) : (
            <ul className="space-y-2" data-testid="incident-list">
              {incidents.slice(0, 5).map((incident) => (
                <li key={incident.id}>
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="lift flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3"
                  >
                    <Badge value={incident.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {incident.title}
                      </span>
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

        <Card title="Change log" hint="deploys, config and capacity events" bodyClass="p-3">
          {!changes?.length ? (
            <Empty icon={<IconCommit size={17} />}>No changes recorded.</Empty>
          ) : (
            <ul className="space-y-2">
              {changes.slice(0, 4).map((change) => (
                <li
                  key={change.id}
                  className="rounded-lg border border-line bg-card px-4 py-3 shadow-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="tnum min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                      {change.version}
                    </code>
                    <Badge value={change.kind} tone="neutral" />
                    <Badge value={change.risk} label={`${change.risk} risk`} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">
                    {change.change_summary}
                  </p>
                  <p className="tnum mt-1.5 text-[11.5px] text-ink-3">
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
