import { useNavigate } from 'react-router-dom'

import { Button, Card, Empty, Pill, fmtTime } from '../components/ui'
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

  const active = status?.simulator.active_scenarios ?? []
  const openIncident = (incidents ?? []).find((i) => !['resolved', 'cancelled'].includes(i.status))

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Demo Lab</h1>
          <p className="mt-1 text-sm text-mist-400">
            Inject a failure into the simulated platform and watch detection, investigation and
            recovery run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openIncident && (
            <Button onClick={() => navigate(`/incidents/${openIncident.id}`)}>
              Open investigation #{openIncident.id}
            </Button>
          )}
          <Button
            variant="danger"
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
            title="Clear all injected faults and cancel active incidents"
          >
            {restore.isPending ? 'Restoring...' : 'Restore system'}
          </Button>
        </div>
      </header>

      <Card
        title="Simulator state"
        actions={<Pill value={status?.simulator.healthy ? 'healthy' : 'degraded'} />}
      >
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded border border-ink-800 bg-ink-900/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-mist-400">Ticks elapsed</div>
            <div className="mt-0.5 font-mono text-mist-100">{status?.simulator.tick ?? 0}</div>
          </div>
          <div className="rounded border border-ink-800 bg-ink-900/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-mist-400">Active faults</div>
            <div className="mt-0.5 font-mono text-mist-100">
              {active.length ? active.join(', ') : 'none'}
            </div>
          </div>
          <div className="rounded border border-ink-800 bg-ink-900/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-mist-400">
              Actions executed
            </div>
            <div className="mt-0.5 font-mono text-mist-100">
              {status?.simulator.applied_actions.length ?? 0}
            </div>
          </div>
        </div>

        {status?.simulator.applied_actions.length ? (
          <ul className="mt-3 space-y-1.5">
            {status.simulator.applied_actions.map((action, index) => (
              <li
                key={`${action.action_id}-${index}`}
                className="flex items-center justify-between rounded border border-ink-800 bg-ink-850/50 px-3 py-2 text-xs"
              >
                <span className="font-mono text-mist-100">
                  {action.action_id} on {action.service}
                </span>
                <span className="flex items-center gap-2">
                  <Pill
                    value={action.resolved_fault ? 'healthy' : 'unknown'}
                    label={action.resolved_fault ? 'cleared the fault' : 'no effect on fault'}
                  />
                  <span className="font-mono text-[10px] text-mist-400">{fmtTime(action.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Inject a failure" subtitle="Each scenario has a distinct signal fingerprint">
        <div className="grid grid-cols-3 gap-4" data-testid="scenario-list">
          {(scenarios ?? []).map((scenario) => {
            const running = active.includes(scenario.id)
            return (
              <article
                key={scenario.id}
                className="flex flex-col rounded-lg border border-ink-800 bg-ink-850/50 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-mist-100">{scenario.title}</h3>
                  {running && <Pill value="degraded" label="active" />}
                </div>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-mist-300">
                  {scenario.description}
                </p>
                <p className="mt-2 font-mono text-[10px] text-mist-400">
                  origin: {scenario.primary_service}
                </p>
                <div className="mt-3">
                  <Button
                    variant="primary"
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
          <p className="mt-3 text-xs text-alarm-500">{(inject.error as Error).message}</p>
        )}
      </Card>

      <Card
        title="Approved remediation catalogue"
        subtitle="The complete set of actions Aegis can propose. Nothing else is executable."
      >
        {actions?.length ? (
          <div className="grid grid-cols-3 gap-3">
            {actions.map((action) => (
              <article
                key={action.id}
                className="rounded-lg border border-ink-800 bg-ink-850/50 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-signal-400">{action.id}</span>
                  <Pill value={action.risk} />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-mist-300">{action.description}</p>
                <p className="mt-2 font-mono text-[10px] text-mist-400">
                  {action.params.map((p) => `${p.name}:${p.kind}`).join(', ')}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <Empty>Catalogue unavailable.</Empty>
        )}
      </Card>
    </div>
  )
}
