import { Link } from 'react-router-dom'

import { MetricChart } from '../components/MetricChart'
import { Card, Empty, Pill, Stat, fmtMs, fmtPct, fmtTime } from '../components/ui'
import { useChanges, useIncidents, useServiceMetrics, useSystemStatus } from '../hooks/queries'

function ServiceRow({
  name,
  tier,
  status,
  latency,
  slo,
  errorRate,
  errorSlo,
  saturation,
  breaches,
}: {
  name: string
  tier: string
  status: string
  latency: number | null
  slo: number
  errorRate: number | null
  errorSlo: number
  saturation: number | null
  breaches: string[]
}) {
  const latencyBad = latency !== null && latency > slo
  const errorBad = errorRate !== null && errorRate > errorSlo
  return (
    <div
      data-testid={`service-${name}`}
      className="grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))_auto] items-center gap-3 border-b border-ink-800 px-1 py-2.5 last:border-0"
    >
      <div>
        <div className="text-sm text-mist-100">{name}</div>
        <div className="text-[11px] text-mist-400">{tier}</div>
      </div>
      <div className={`font-mono text-sm ${latencyBad ? 'text-alarm-500' : 'text-mist-300'}`}>
        {fmtMs(latency)}
        <span className="ml-1 text-[10px] text-mist-400">/ {fmtMs(slo)}</span>
      </div>
      <div className={`font-mono text-sm ${errorBad ? 'text-alarm-500' : 'text-mist-300'}`}>
        {fmtPct(errorRate)}
      </div>
      <div className="font-mono text-sm text-mist-300">
        {saturation === null ? '--' : saturation.toFixed(2)}
      </div>
      <div title={breaches.join('\n')}>
        <Pill value={status} />
      </div>
    </div>
  )
}

export function CommandCenter() {
  const { data: status, isLoading } = useSystemStatus()
  const { data: incidents } = useIncidents()
  const { data: changes } = useChanges()
  const { data: gatewayMetrics } = useServiceMetrics('gateway')

  const active = (incidents ?? []).filter(
    (i) => !['resolved', 'cancelled'].includes(i.status),
  )
  const recent = (incidents ?? []).slice(0, 6)
  const gateway = status?.services.find((s) => s.name === 'gateway')
  const degraded = (status?.services ?? []).filter((s) => s.status === 'degraded')

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
          <p className="mt-1 text-sm text-mist-400">
            Live platform health, open investigations and the change log.
          </p>
        </div>
        <div data-testid="platform-status">
          <Pill value={status?.healthy ? 'healthy' : 'degraded'} />
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4">
        <Stat
          label="Platform"
          value={isLoading ? '...' : status?.healthy ? 'Healthy' : 'Degraded'}
          tone={status?.healthy ? 'ok' : 'alarm'}
          hint={`${degraded.length} service(s) outside SLO`}
        />
        <Stat
          label="Active incidents"
          value={active.length}
          tone={active.length ? 'alarm' : 'ok'}
          hint={active.length ? active[0].title : 'nothing open'}
        />
        <Stat
          label="Gateway p95"
          value={fmtMs(gateway?.latency_p95_ms ?? null)}
          tone={
            gateway && gateway.latency_p95_ms !== null &&
            gateway.latency_p95_ms > gateway.slo_latency_p95_ms
              ? 'alarm'
              : 'ok'
          }
          hint={`SLO ${fmtMs(gateway?.slo_latency_p95_ms)}`}
        />
        <Stat
          label="Gateway errors"
          value={fmtPct(gateway?.error_rate ?? null)}
          tone={
            gateway && gateway.error_rate !== null && gateway.error_rate > gateway.slo_error_rate
              ? 'alarm'
              : 'ok'
          }
          hint={`SLO ${fmtPct(gateway?.slo_error_rate)}`}
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card
          className="col-span-2"
          title="Services"
          subtitle="Latest sample against each service SLO"
        >
          <div className="grid grid-cols-[1.4fr_repeat(3,minmax(0,1fr))_auto] gap-3 border-b border-ink-800 px-1 pb-2 text-[11px] uppercase tracking-wider text-mist-400">
            <span>Service</span>
            <span>p95 / SLO</span>
            <span>Errors</span>
            <span>Saturation</span>
            <span>State</span>
          </div>
          {(status?.services ?? []).map((service) => (
            <ServiceRow
              key={service.name}
              name={service.name}
              tier={service.tier}
              status={service.status}
              latency={service.latency_p95_ms}
              slo={service.slo_latency_p95_ms}
              errorRate={service.error_rate}
              errorSlo={service.slo_error_rate}
              saturation={service.saturation}
              breaches={service.breaches}
            />
          ))}
        </Card>

        <Card title="Gateway p95 latency" subtitle="Customer-facing edge">
          {gatewayMetrics?.length ? (
            <MetricChart
              data={gatewayMetrics}
              metric="latency_p95_ms"
              slo={gateway?.slo_latency_p95_ms}
            />
          ) : (
            <Empty>Waiting for telemetry.</Empty>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Incidents" subtitle="Newest first">
          {recent.length === 0 ? (
            <Empty>No incidents recorded yet. Inject a failure from the Demo Lab.</Empty>
          ) : (
            <ul className="space-y-2" data-testid="incident-list">
              {recent.map((incident) => (
                <li key={incident.id}>
                  <Link
                    to={`/incidents/${incident.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 bg-ink-850/50 px-4 py-3 transition hover:border-ink-600"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-mist-100">{incident.title}</div>
                      <div className="mt-0.5 text-[11px] text-mist-400">
                        #{incident.id} · {incident.service} · opened {fmtTime(incident.opened_at)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Pill value={incident.severity} />
                      <Pill value={incident.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Change log" subtitle="Deploys, config changes and capacity events">
          {changes?.length ? (
            <ul className="space-y-2">
              {changes.slice(0, 6).map((change) => (
                <li
                  key={change.id}
                  className="rounded-lg border border-ink-800 bg-ink-850/50 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-signal-400">{change.version}</span>
                    <div className="flex items-center gap-2">
                      <Pill value={change.kind} />
                      <Pill value={change.risk} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-mist-300">
                    {change.change_summary}
                  </p>
                  <p className="mt-1 text-[11px] text-mist-400">
                    {change.service} · {fmtTime(change.ts)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No changes recorded.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
