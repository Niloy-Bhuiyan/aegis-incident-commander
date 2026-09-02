import { useNavigate } from 'react-router-dom'

import { IconIncident, IconPlay, IconRotate, IconShield } from '../components/icons'
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">Demo Lab</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-ink-3">
            Inject a failure into the simulated platform and watch detection, investigation and
            recovery run end to end.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openIncident && (
            <Button
              variant="primary"
              icon={<IconIncident size={14} />}
              onClick={() => navigate(`/incidents/${openIncident.id}`)}
            >
              Investigation #{openIncident.id}
            </Button>
          )}
          <Button
            variant="danger"
            icon={<IconRotate size={14} />}
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
            title="Clear injected faults and cancel active incidents"
          >
            {restore.isPending ? 'Restoring…' : 'Restore system'}
          </Button>
        </div>
      </header>

      {readOnlySource && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-[12.5px] text-warn">
          This instance reads a real metrics backend. The Demo Lab drives the simulator only.
        </p>
      )}

      <Card
        title="Simulator state"
        actions={<Badge value={simulator?.healthy ? 'healthy' : 'degraded'} />}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Field label="ticks elapsed">
            <span className="tnum">{simulator?.tick ?? 0}</span>
          </Field>
          <Field label="active faults">
            {/* "not loaded" and "loaded, nothing active" are different facts. */}
            <span data-testid="active-faults" className="tnum">
              {!simulator ? '—' : active.length ? active.join(', ') : 'none'}
            </span>
          </Field>
          <Field label="actions executed">
            <span className="tnum">{applied.length}</span>
          </Field>
        </div>

        {applied.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-line pt-4">
            {applied.map((action, index) => (
              <li
                key={`${action.action_id}-${index}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sunken px-3.5 py-2.5"
              >
                <code className="tnum text-[12.5px] font-semibold text-ink">
                  {action.action_id}
                </code>
                <span className="text-[12.5px] text-ink-2">on {action.service}</span>
                <span className="ml-auto flex items-center gap-2.5">
                  <Badge
                    value={action.resolved_fault ? 'healthy' : 'unknown'}
                    label={action.resolved_fault ? 'cleared the fault' : 'no effect on fault'}
                  />
                  <span className="tnum text-[11px] text-ink-3">{fmtTime(action.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Inject a failure" hint="each scenario has a distinct signal fingerprint">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="scenario-list">
          {(scenarios ?? []).map((scenario) => {
            const running = active.includes(scenario.id)
            return (
              <article
                key={scenario.id}
                className={`flex flex-col rounded-lg border px-4 py-4 transition-colors duration-200 ${
                  running ? 'border-alarm-line bg-alarm-bg' : 'border-line bg-card shadow-1'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13.5px] leading-snug font-semibold text-ink">
                    {scenario.title}
                  </h3>
                  {running && <Badge value="degraded" label="active" />}
                </div>
                <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-ink-2">
                  {scenario.description}
                </p>
                <p className="tnum mt-3 text-[11px] text-ink-3">origin: {scenario.primary_service}</p>
                <div className="mt-3.5">
                  <Button
                    size="sm"
                    variant={running ? 'secondary' : 'primary'}
                    icon={<IconPlay size={12} />}
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
      </Card>

      <Card
        title="Approved remediation catalogue"
        hint="the complete set of executable actions"
        actions={
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <IconShield size={13} />
            allowlist
          </span>
        }
      >
        {actions?.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {actions.map((action) => (
              <article
                key={action.id}
                className="rounded-lg border border-line bg-card px-4 py-3.5 shadow-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="tnum text-[12.5px] font-semibold text-ink">{action.id}</code>
                  <Badge value={action.risk} />
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
                  {action.description}
                </p>
                <p className="tnum mt-2 text-[11px] text-ink-3">
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
