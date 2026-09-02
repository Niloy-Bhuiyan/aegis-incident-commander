import { useNavigate } from 'react-router-dom'

import { IconIncident, IconPlay, IconRotate, IconShield } from '../components/icons'
import { Badge, Button, Empty, Field, Panel, fmtTime } from '../components/ui'
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Demo Lab</h1>
          <p className="text-[11px] text-fg-3">
            Inject a failure into the simulated platform and watch detection, investigation and
            recovery run.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {openIncident && (
            <Button
              icon={<IconIncident size={13} />}
              onClick={() => navigate(`/incidents/${openIncident.id}`)}
            >
              Investigation #{openIncident.id}
            </Button>
          )}
          <Button
            variant="danger"
            icon={<IconRotate size={13} />}
            disabled={restore.isPending}
            onClick={() => restore.mutate()}
            title="Clear injected faults and cancel active incidents"
          >
            {restore.isPending ? 'Restoring…' : 'Restore system'}
          </Button>
        </div>
      </div>

      {readOnlySource && (
        <p className="rounded-sm border border-warn/30 bg-warn-dim px-2.5 py-1.5 text-[11px] text-warn">
          This instance reads a real metrics backend. The Demo Lab drives the simulator only.
        </p>
      )}

      <Panel
        title="Simulator state"
        actions={<Badge value={simulator?.healthy ? 'healthy' : 'degraded'} />}
      >
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <Field label="ticks elapsed">
            <span className="tnum">{simulator?.tick ?? 0}</span>
          </Field>
          <Field label="active faults">
            {/* Distinguish "not loaded yet" from "loaded, nothing active" - they
                are different facts, and conflating them makes a waiting test
                pass against stale state. */}
            <span data-testid="active-faults" className="tnum">
              {!simulator ? '—' : active.length ? active.join(', ') : 'none'}
            </span>
          </Field>
          <Field label="actions executed">
            <span className="tnum">{applied.length}</span>
          </Field>
        </div>

        {applied.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-line pt-2">
            {applied.map((action, index) => (
              <li
                key={`${action.action_id}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-raised px-2 py-1.5"
              >
                <code className="tnum text-[11px] text-info">
                  {action.action_id}
                </code>
                <span className="text-[11px] text-fg-2">on {action.service}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <Badge
                    value={action.resolved_fault ? 'healthy' : 'unknown'}
                    label={action.resolved_fault ? 'cleared the fault' : 'no effect on fault'}
                  />
                  <span className="tnum text-[10px] text-fg-3">{fmtTime(action.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Inject a failure" hint="each scenario has a distinct signal fingerprint">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3" data-testid="scenario-list">
          {(scenarios ?? []).map((scenario) => {
            const running = active.includes(scenario.id)
            return (
              <article
                key={scenario.id}
                className={`flex flex-col rounded-sm border px-2.5 py-2 ${
                  running ? 'border-alarm/40 bg-alarm-dim/40' : 'border-line bg-raised'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-medium text-fg">{scenario.title}</h3>
                  {running && <Badge value="degraded" label="active" />}
                </div>
                <p className="mt-1 flex-1 text-[11px] leading-snug text-fg-2">
                  {scenario.description}
                </p>
                <p className="tnum mt-1.5 text-[10px] text-fg-3">
                  origin: {scenario.primary_service}
                </p>
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="approve"
                    icon={<IconPlay size={11} />}
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
          <p className="mt-2 text-[11px] text-alarm">{(inject.error as Error).message}</p>
        )}
      </Panel>

      <Panel
        title="Approved remediation catalogue"
        hint="the complete set of executable actions"
        actions={
          <span className="flex items-center gap-1 text-[10px] text-fg-3">
            <IconShield size={11} />
            allowlist
          </span>
        }
      >
        {actions?.length ? (
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            {actions.map((action) => (
              <article
                key={action.id}
                className="rounded-sm border border-line bg-raised px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="tnum text-[11px] text-info">{action.id}</code>
                  <Badge value={action.risk} />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-fg-2">{action.description}</p>
                <p className="tnum mt-1 text-[10px] text-fg-3">
                  {action.params.map((p) => `${p.name}:${p.kind}`).join(', ')}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <Empty>Catalogue unavailable.</Empty>
        )}
      </Panel>
    </div>
  )
}
