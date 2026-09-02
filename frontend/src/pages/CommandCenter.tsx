import { Link } from 'react-router-dom'

import type { MetricPoint, ServiceHealth } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { Sparkline } from '../components/Sparkline'
import { IconCommit, IconIncident, IconLink, TierIcon } from '../components/icons'
import {
  Badge,
  Empty,
  Metric,
  Panel,
  StatusDot,
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
  const errorBreached =
    service.error_rate !== null && service.error_rate > service.slo_error_rate
  const saturationBreached = service.saturation !== null && service.saturation > 0.92

  return (
    <tr
      data-testid={`service-${service.name}`}
      className="border-t border-line transition-colors duration-150 hover:bg-raised"
    >
      <td className="py-1.5 pl-3 pr-2">
        <div className="flex items-center gap-2">
          <TierIcon tier={service.tier} size={13} className="shrink-0 text-fg-3" />
          <span className="truncate text-xs text-fg">{service.name}</span>
        </div>
      </td>
      <td className="hidden px-2 py-1.5 md:table-cell">
        <Sparkline
          values={series.map((p) => p.latency_p95_ms)}
          threshold={service.slo_latency_p95_ms}
          label={`${service.name} p95 latency trend`}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Metric
          value={fmtMs(service.latency_p95_ms)}
          threshold={fmtMs(service.slo_latency_p95_ms)}
          breached={latencyBreached}
          className="text-xs"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Metric
          value={fmtPct(service.error_rate)}
          threshold={fmtPct(service.slo_error_rate, 1)}
          breached={errorBreached}
          className="text-xs"
        />
      </td>
      <td className="hidden px-2 py-1.5 text-right sm:table-cell">
        <Metric
          value={fmtNum(service.saturation)}
          breached={saturationBreached}
          className="text-xs"
        />
      </td>
      <td className="py-1.5 pl-2 pr-3 text-right">
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Command Center</h1>
          <p className="text-[11px] text-fg-3">
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
            className="flex items-center gap-2 rounded-sm border border-alarm/40 bg-alarm-dim px-2.5 py-1.5 text-xs text-alarm transition-colors duration-150 hover:bg-alarm/20"
          >
            <IconIncident size={14} />
            <span className="truncate">{active[0].title}</span>
            <Badge value={active[0].workflow_state} tone="warn" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Services"
          hint="latest sample vs SLO"
          bodyClass="p-0"
          actions={
            status ? (
              <span className="tnum text-[10px] text-fg-3">
                {status.services.filter((s) => s.status === 'healthy').length}/
                {status.services.length} healthy
              </span>
            ) : null
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="text-[9.5px] uppercase tracking-[0.08em] text-fg-3">
                  <th className="py-1.5 pl-3 pr-2 text-left font-medium">Service</th>
                  <th className="hidden px-2 py-1.5 text-left font-medium md:table-cell">
                    p95 trend
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">p95 / SLO</th>
                  <th className="px-2 py-1.5 text-right font-medium">errors / SLO</th>
                  <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">
                    saturation
                  </th>
                  <th className="py-1.5 pl-2 pr-3 text-right font-medium">State</th>
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
        </Panel>

        <Panel
          title={focusService}
          hint="p95 latency"
          actions={focus ? <StatusDot value={focus.status} /> : null}
        >
          {focusMetrics?.length ? (
            <MetricChart
              data={focusMetrics}
              metric="latency_p95_ms"
              slo={focus?.slo_latency_p95_ms}
              height={140}
            />
          ) : (
            <Empty>Waiting for telemetry.</Empty>
          )}
          {focus && (
            <div className="mt-2 grid grid-cols-3 gap-1.5 border-t border-line pt-2">
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-3">p50</div>
                <div className="tnum text-xs text-fg">{fmtMs(focus.latency_p50_ms)}</div>
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-3">rps</div>
                <div className="tnum text-xs text-fg">{focus.rps?.toFixed(0) ?? '—'}</div>
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.08em] text-fg-3">saturation</div>
                <div className="tnum text-xs text-fg">{fmtNum(focus.saturation)}</div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Incidents"
          hint="newest first"
          bodyClass="p-2"
          actions={
            <Link
              to="/incidents"
              className="text-[10px] text-fg-3 transition-colors duration-150 hover:text-info"
            >
              view all
            </Link>
          }
        >
          {!incidents?.length ? (
            <Empty icon={<IconIncident size={18} />}>
              No incidents recorded. Inject a failure from the Demo Lab to see the full
              investigation flow.
            </Empty>
          ) : (
            <ul className="space-y-1" data-testid="incident-list">
              {incidents.slice(0, 6).map((incident) => (
                <li key={incident.id}>
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="flex items-center gap-2 rounded-sm border border-line bg-raised px-2.5 py-1.5 transition-colors duration-150 hover:border-line-strong hover:bg-hover"
                  >
                    <StatusDot value={incident.severity} />
                    <span className="tnum shrink-0 text-[10px] text-fg-3">#{incident.id}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-fg">
                      {incident.title}
                    </span>
                    <span className="tnum hidden shrink-0 text-[10px] text-fg-3 sm:inline">
                      {fmtAgo(incident.opened_at)}
                    </span>
                    <Badge value={incident.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Change log" hint="deploys, config and capacity events" bodyClass="p-2">
          {!changes?.length ? (
            <Empty icon={<IconCommit size={18} />}>No changes recorded.</Empty>
          ) : (
            <ul className="space-y-1">
              {changes.slice(0, 5).map((change) => (
                <li
                  key={change.id}
                  className="rounded-sm border border-line bg-raised px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <IconLink size={12} className="shrink-0 text-fg-3" />
                    <span className="tnum min-w-0 flex-1 truncate text-[11px] text-info">
                      {change.version}
                    </span>
                    <Badge value={change.kind} tone="neutral" />
                    <Badge value={change.risk} label={`${change.risk} risk`} />
                  </div>
                  <p className="mt-1 line-clamp-2 pl-5 text-[11px] leading-snug text-fg-2">
                    {change.change_summary}
                  </p>
                  <p className="tnum mt-0.5 pl-5 text-[10px] text-fg-3">
                    {change.service} · {fmtAgo(change.ts)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
