import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { Evidence, Hypothesis, Plan } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { Badge, Button, Card, Empty, Field, fmtAgo, fmtTime } from '../components/ui'
import { useApprove, useIncident, useReject, useServiceMetrics } from '../hooks/queries'

const STEPS = [
  'detected',
  'collecting_evidence',
  'retrieving_knowledge',
  'generating_hypotheses',
  'critiquing',
  'ranking',
  'planning_remediation',
  'awaiting_approval',
  'executing',
  'verifying',
  'resolved',
]

function WorkflowTrack({ state }: { state: string }) {
  const index = STEPS.indexOf(state)
  const offPath = index === -1
  const label = state.replace(/_/g, ' ')
  const pct = offPath ? 100 : ((index + 1) / STEPS.length) * 100

  return (
    <div data-testid="workflow-track" className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] text-ink">
          <span className="text-ink-3">Now: </span>
          {label}
        </span>
        {!offPath && (
          <span className="tnum text-[12px] text-ink-3">
            step {index + 1} of {STEPS.length}
          </span>
        )}
      </div>
      <div
        className="h-[3px] w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={offPath ? undefined : index + 1}
        aria-label={`Workflow position: ${label}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            state === 'resolved' ? 'bg-ok' : offPath ? 'bg-warn' : 'bg-ink'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Citation({ refId, onSelect }: { refId: string; onSelect: (ref: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(refId)}
      title={`Show ${refId.startsWith('K') ? 'document' : 'evidence'} ${refId}`}
      className="tnum rounded-sm border border-line px-1.5 text-[11.5px] text-ink-2 transition-colors duration-150 hover:border-ink hover:text-ink"
    >
      {refId}
    </button>
  )
}

function HypothesisCard({
  hypothesis,
  onSelect,
}: {
  hypothesis: Hypothesis
  onSelect: (ref: string) => void
}) {
  const leading = hypothesis.rank === 1

  return (
    <article
      data-testid={`hypothesis-${hypothesis.rank}`}
      className={`border-t border-line py-3.5 first:border-t-0 ${leading ? '' : 'opacity-80'}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tnum text-[12px] text-ink-3">#{hypothesis.rank}</span>
        <span className="text-[13px] text-ink">
          {hypothesis.cause_type.replace(/_/g, ' ')}
          {leading && <span className="ml-2 text-[12px] text-ink-3">most likely</span>}
        </span>
        <span className="ml-auto flex items-baseline gap-3">
          <Badge value={hypothesis.verdict} />
          <span className="tnum text-[12px] text-ink-3">{hypothesis.final_score.toFixed(2)}</span>
        </span>
      </div>

      <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{hypothesis.statement}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{hypothesis.mechanism}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-ink-3">Based on</span>
        {hypothesis.citations.length ? (
          hypothesis.citations.map((c) => <Citation key={c} refId={c} onSelect={onSelect} />)
        ) : (
          <span className="text-[12px] text-alarm">nothing — no citations</span>
        )}
        <span className="tnum ml-2 text-[12px] text-ink-3">
          {(hypothesis.confidence * 100).toFixed(0)}% confidence,{' '}
          {(hypothesis.support_score * 100).toFixed(0)}% of it backed by evidence
        </span>
      </div>

      {hypothesis.critic_note && (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-2">
          <span className="text-ink">Reviewer. </span>
          {hypothesis.critic_note}
        </p>
      )}

      {hypothesis.unsupported_claims.map((claim) => (
        <p key={claim} className="mt-1.5 text-[12.5px] leading-relaxed text-warn">
          Unsupported: {claim}
        </p>
      ))}
    </article>
  )
}

function EvidenceCard({ item, highlighted }: { item: Evidence; highlighted: boolean }) {
  return (
    <article
      id={`evidence-${item.ref}`}
      data-testid={`evidence-${item.ref}`}
      className={`scroll-mt-6 border-t border-line px-3 py-3 transition-colors duration-300 first:border-t-0 ${
        highlighted ? 'border-info bg-info-bg' : ''
      }`}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="tnum shrink-0 text-[11.5px] text-ink-3">{item.ref}</span>
        <h3 className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">{item.title}</h3>
        <span className="shrink-0 text-[11.5px] text-ink-3">{item.kind.replace(/_/g, ' ')}</span>
      </div>
      <pre className="mt-1.5 pl-7 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
        {item.content}
      </pre>
      <p className="tnum mt-1.5 pl-7 text-[11px] text-ink-3">{item.source}</p>
    </article>
  )
}

function RemediationPanel({ incidentId, plan }: { incidentId: number; plan: Plan }) {
  const approve = useApprove()
  const reject = useReject()
  const pending = plan.status === 'awaiting_approval'
  const dryRun = plan.status === 'dry_run'

  return (
    <div data-testid="remediation-plan" className="space-y-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <code className="tnum text-[13.5px] text-ink">{plan.action_id}</code>
        <span className="flex items-baseline gap-3 text-[12px] text-ink-3">
          <span>{plan.risk} risk</span>
          <Badge value={plan.status} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {Object.entries(plan.params).map(([key, value]) => (
          <Field key={key} label={key}>
            <span className="tnum">{String(value)}</span>
          </Field>
        ))}
      </div>

      <dl className="space-y-2 text-[12.5px] leading-relaxed text-ink-2">
        <div>
          <dt className="inline text-ink">Why. </dt>
          <dd className="inline">{plan.rationale}</dd>
        </div>
        <div>
          <dt className="inline text-ink">What should happen. </dt>
          <dd className="inline">{plan.expected_effect}</dd>
        </div>
        <div>
          <dt className="inline text-ink">How to undo it. </dt>
          <dd className="inline">{plan.rollback}</dd>
        </div>
      </dl>

      {typeof plan.result?.detail === 'string' && (
        <p
          className={`rounded-sm border border-line px-3 py-2 text-[12.5px] leading-relaxed ${
            dryRun ? 'bg-warn-bg text-warn' : 'bg-sunken text-ink-2'
          }`}
        >
          {plan.result.detail}
        </p>
      )}

      {pending ? (
        <div className="space-y-2 border-t border-line pt-3.5">
          <p className="text-[12.5px] text-ink-2">
            Nothing has run yet. Aegis waits here until a person decides.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={approve.isPending}
              onClick={() => approve.mutate({ incidentId, planId: plan.id, approver: 'operator' })}
            >
              {approve.isPending ? 'Running…' : 'Approve and execute'}
            </Button>
            <Button
              variant="danger"
              disabled={reject.isPending}
              onClick={() =>
                reject.mutate({
                  incidentId,
                  planId: plan.id,
                  approver: 'operator',
                  reason: 'rejected from the console',
                })
              }
            >
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <p className="tnum border-t border-line pt-3 text-[11.5px] text-ink-3">
          {plan.approved_by ? `Actioned by ${plan.approved_by}` : 'No operator action recorded'}
          {plan.executed_at ? ` · ${fmtTime(plan.executed_at)}` : ''}
        </p>
      )}
    </div>
  )
}

export function IncidentInvestigation() {
  const { id } = useParams()
  const incidentId = Number(id)
  const { data: incident, isLoading } = useIncident(incidentId)
  const { data: metrics } = useServiceMetrics(incident?.service ?? 'gateway')
  const [highlight, setHighlight] = useState<string | null>(null)

  const selectCitation = (ref: string) => {
    setHighlight(ref)
    document
      .getElementById(`evidence-${ref}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (isLoading) return <Empty>Loading investigation…</Empty>
  if (!incident) return <Empty>Incident not found.</Empty>

  const telemetry = incident.evidence.filter((e) => e.kind !== 'knowledge')
  const knowledge = incident.evidence.filter((e) => e.kind === 'knowledge')
  const plan = incident.plans.at(-1)

  return (
    <div className="space-y-7">
      <header className="space-y-4">
        <Link
          to="/incidents"
          className="text-[12.5px] text-ink-3 transition-colors duration-150 hover:text-ink"
        >
          ← All investigations
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1
              className="text-[21px] leading-tight font-semibold tracking-tight text-ink"
              data-testid="incident-title"
            >
              {incident.title}
            </h1>
            <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
              #{incident.id} · {incident.service} · opened {fmtAgo(incident.opened_at)} by{' '}
              {incident.detector}
            </p>
          </div>
          <div className="flex items-center gap-4" data-testid="incident-status">
            <Badge value={incident.severity} />
            <Badge value={incident.status} />
          </div>
        </div>

        <WorkflowTrack state={incident.workflow_state} />

        <p className="max-w-3xl text-[12.5px] leading-relaxed text-ink-3">
          Aegis collected the telemetry below, searched the knowledge base, proposed possible
          causes, had them checked against the evidence, and picked one fix. It cannot run anything
          without your approval.
        </p>
      </header>

      {incident.workflow_error && (
        <Card title="Workflow error">
          <p className="tnum text-[12.5px] text-alarm">{incident.workflow_error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-7">
          <Card bare title="What is wrong">
            <p className="text-[13.5px] leading-relaxed text-ink" data-testid="incident-summary">
              {incident.summary || 'Investigation in progress…'}
            </p>
            {incident.root_cause && (
              <p className="mt-3 border-l-2 border-ink pl-3 text-[13.5px] leading-relaxed text-ink">
                <span className="text-ink-3">Root cause. </span>
                {incident.root_cause}
              </p>
            )}
            <p className="mt-3 text-[12px] text-ink-3">
              {telemetry.length} pieces of evidence · {knowledge.length} documents retrieved ·{' '}
              {incident.llm_usage?.calls
                ? `${incident.llm_usage.calls} reasoning calls, $${(
                    incident.llm_usage.cost_usd ?? 0
                  ).toFixed(4)}`
                : 'deterministic provider, no model calls'}
            </p>
          </Card>

          <Card bare title="Possible causes" hint="ranked, then checked against the evidence">
            {incident.hypotheses.length ? (
              <div className="border-t border-line">
                {incident.hypotheses.map((h) => (
                  <HypothesisCard key={h.id} hypothesis={h} onSelect={selectCitation} />
                ))}
              </div>
            ) : (
              <Empty>No hypotheses yet.</Empty>
            )}
          </Card>

          <Card title={`${incident.service} p95 latency`} hint="the service the incident starts in">
            {metrics?.length ? (
              <MetricChart data={metrics} metric="latency_p95_ms" height={150} />
            ) : (
              <Empty>No telemetry.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-7">
          <Card title="Proposed fix" hint="one action, from a fixed list">
            {plan ? (
              <RemediationPanel incidentId={incident.id} plan={plan} />
            ) : (
              <Empty>No fix proposed yet.</Empty>
            )}
          </Card>

          <Card
            bare
            title="Evidence"
            hint={`${telemetry.length} measured · ${knowledge.length} retrieved`}
          >
            <div className="max-h-[640px] overflow-y-auto border-t border-line">
              {telemetry.map((item) => (
                <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
              ))}
              {knowledge.length > 0 && (
                <p className="border-t border-line px-3 pt-3 pb-1 text-[11.5px] text-ink-3">
                  From the knowledge base
                </p>
              )}
              {knowledge.map((item) => (
                <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card bare title="What Aegis did" hint="every step, in order">
        <ol data-testid="timeline" className="border-t border-line">
          {incident.events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-2.5"
            >
              <span className="tnum w-16 shrink-0 text-[11.5px] text-ink-3">
                {fmtTime(event.ts)}
              </span>
              <span className="w-40 shrink-0 text-[12.5px] text-ink">
                {event.kind.replace(/_/g, ' ')}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-2">
                {event.message}
              </span>
              <span className="tnum hidden w-20 shrink-0 text-right text-[11px] text-ink-3 sm:block">
                {event.actor}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
