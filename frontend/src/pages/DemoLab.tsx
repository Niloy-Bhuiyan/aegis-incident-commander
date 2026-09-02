import { useNavigate } from 'react-router-dom'

import { Badge, Button, Card, Empty, Field, fmtTime } from '../components/ui'
import {
  useActions,
  useIncidents,
  useInject,
  useRestore,
  useScenarios,
  useSystemStatus,
} from '../hooks/queries'

export function DemoLab() {
  const { data: scenarios } = useScenarios()
  const { data: status } = useSystemStatus()
  const { data: actions } = useActions()
  const { data: incidents } = useIncidents()
  const inject = useInject()
  const restore = useRestore()
  const navigate = useNavigate()

  const simulator = status?.telemetry
  const active = simulator?.active_scenarios ?? []
  const applied = simulator?.applied_actions ?? []
  const openIncident = (incidents ?? []).find(
    (incident) => !['resolved', 'cancelled'].includes(incident.status),
  )
  const readOnlySource = simulator?.supports_remediation === false

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">
            Demo Lab
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-3">Break the platform on purpose</p>
        </div>
        <div className="flex items-center gap-2">
          {openIncident && (
            <Button variant="primary" onClick={() => navigate(`/incidents/${openIncident.id}`)}>
              Open investigation #{openIncident.id}
            </Button>
          )}
          <Button
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
            title="Clear injected faults and cancel active incidents"
          >
            {restore.isPending ? 'Restoring…' : 'Restore system'}
          </Button>
        </div>
      </header>

      {readOnlySource && (
        <p className="rounded-md border border-line bg-warn-bg px-4 py-3 text-[12.5px] text-warn">
          This instance reads a real metrics backend. The Demo Lab drives the simulator only.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-line pb-6 sm:grid-cols-3">
        <Field label="Ticks elapsed">
          <span className="tnum">{simulator?.tick ?? 0}</span>
        </Field>
        <Field label="Active faults">
          {/* "not loaded" and "loaded, nothing active" are different facts. */}
          <span data-testid="active-faults" className="tnum">
            {!simulator ? '—' : active.length ? active.join(', ') : 'none'}
          </span>
        </Field>
        <Field label="Actions executed">
          <span className="tnum">{applied.length}</span>
        </Field>
      </div>

      {applied.length > 0 && (
        <ul className="space-y-1.5">
          {applied.map((action, index) => (
            <li
              key={`${action.action_id}-${index}`}
              className="flex flex-wrap items-baseline gap-x-3 text-[12.5px]"
            >
              <code className="tnum text-ink">{action.action_id}</code>
              <span className="text-ink-2">on {action.service}</span>
              <span className="ml-auto flex items-baseline gap-3">
                <Badge
                  value={action.resolved_fault ? 'healthy' : 'unknown'}
                  label={action.resolved_fault ? 'cleared the fault' : 'no effect on fault'}
                />
                <span className="tnum text-[11.5px] text-ink-3">{fmtTime(action.at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="text-[13.5px] font-semibold text-ink">Inject a failure</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Each one produces a different pattern in the metrics, so Aegis has to tell them apart.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="scenario-list">
          {(scenarios ?? []).map((scenario) => {
            const running = active.includes(scenario.id)
            return (
              <article
                key={scenario.id}
                className={`flex flex-col rounded-md border p-4 ${
                  running ? 'border-line bg-alarm-bg' : 'border-line'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-medium text-ink">{scenario.title}</h3>
                  {running && <Badge value="degraded" label="active" />}
                </div>
                <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-ink-2">
                  {scenario.description}
                </p>
                <p className="tnum mt-2.5 text-[11.5px] text-ink-3">
                  starts in {scenario.primary_service}
                </p>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant={running ? 'secondary' : 'primary'}
                    disabled={running || inject.isPending}
                    onClick={() => inject.mutate(scenario.id)}
                  >
                    {running ? 'Injected' : 'Inject failure'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
        {inject.isError && (
          <p className="mt-3 text-[12.5px] text-alarm">{(inject.error as Error).message}</p>
        )}
      </section>

      <Card bare title="What Aegis is allowed to do" hint="it cannot run anything outside this list">
        {actions?.length ? (
          <ul className="border-t border-line">
            {actions.map((action) => (
              <li key={action.id} className="border-b border-line py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <code className="tnum text-[12.5px] text-ink">{action.id}</code>
                  <span className="text-[11.5px] text-ink-3">{action.risk} risk</span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
                  {action.description}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Catalogue unavailable.</Empty>
        )}
      </Card>
    </div>
  )
}
