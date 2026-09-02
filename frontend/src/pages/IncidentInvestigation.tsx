import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { Evidence, Hypothesis, Plan } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { IconArrowLeft, IconCheck, IconDoc, IconGauge, IconShield, IconX } from '../components/icons'
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  fmtAgo,
  fmtTime,
  toneFor,
} from '../components/ui'
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

/** Progress through the pipeline: a slim track plus a named position. */
function WorkflowTrack({ state }: { state: string }) {
  const index = STEPS.indexOf(state)
  const offPath = index === -1
  const label = state.replace(/_/g, ' ')

  return (
    <div data-testid="workflow-track" className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-semibold text-ink capitalize">{label}</span>
        {!offPath && (
          <span className="tnum text-[11.5px] text-ink-3">
            step {index + 1} of {STEPS.length}
          </span>
        )}
      </div>
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={offPath ? undefined : index + 1}
        aria-label={`Workflow position: ${label}`}
      >
        {STEPS.map((step, i) => {
          const done = !offPath && i < index
          const current = step === state
          return (
            <span
              key={step}
              title={step.replace(/_/g, ' ')}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                current
                  ? 'bg-info'
                  : done
                    ? 'bg-ok/55'
                    : offPath
                      ? 'bg-warn/25'
                      : 'bg-line-strong'
              }`}
            />
          )
        })}
      </div>
    </div>
  )
}

function Citation({ refId, onSelect }: { refId: string; onSelect: (ref: string) => void }) {
  const isKnowledge = refId.startsWith('K')
  return (
    <button
      type="button"
      onClick={() => onSelect(refId)}
      title={`Show ${isKnowledge ? 'document' : 'evidence'} ${refId}`}
      className={`tnum rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors duration-200 ${
        isKnowledge
          ? 'border-warn-line bg-warn-bg text-warn hover:border-warn/50'
          : 'border-info-line bg-info-bg text-info hover:border-info/50'
      }`}
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
      className={`rounded-lg border px-4 py-3.5 ${
        leading ? 'border-info-line bg-info-bg/40' : 'border-line bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="tnum text-[11.5px] font-medium text-ink-3">#{hypothesis.rank}</span>
        <Badge value={hypothesis.cause_type} tone={leading ? 'info' : 'neutral'} />
        {leading && <Badge value="leading" tone="info" />}
        <span className="ml-auto flex items-center gap-2">
          <Badge value={hypothesis.verdict} tone={toneFor(hypothesis.verdict)} />
          <span className="tnum text-[12px] font-semibold text-ink">
            {hypothesis.final_score.toFixed(2)}
          </span>
        </span>
      </div>

      <p className="mt-2.5 text-[13.5px] leading-relaxed font-medium text-ink">
        {hypothesis.statement}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{hypothesis.mechanism}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {hypothesis.citations.length ? (
          hypothesis.citations.map((c) => <Citation key={c} refId={c} onSelect={onSelect} />)
        ) : (
          <span className="text-[11.5px] font-medium text-alarm">no citations</span>
        )}
        <span className="tnum ml-1.5 text-[11.5px] text-ink-3">
          {(hypothesis.confidence * 100).toFixed(0)}% confidence ·{' '}
          {(hypothesis.support_score * 100).toFixed(0)}% support
        </span>
      </div>

      {hypothesis.critic_note && (
        <p className="mt-3 rounded-md border-l-2 border-line-strong bg-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">Critic. </span>
          {hypothesis.critic_note}
        </p>
      )}

      {hypothesis.unsupported_claims.length > 0 && (
        <ul className="mt-2 space-y-1">
          {hypothesis.unsupported_claims.map((claim) => (
            <li
              key={claim}
              className="flex gap-2 rounded-md bg-warn-bg px-3 py-1.5 text-[12px] leading-relaxed text-warn"
            >
              <span aria-hidden className="mt-[3px] text-[8px]">
                ▲
              </span>
              <span>Unsupported: {claim}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function EvidenceCard({ item, highlighted }: { item: Evidence; highlighted: boolean }) {
  const isKnowledge = item.kind === 'knowledge'
  return (
    <article
      id={`evidence-${item.ref}`}
      data-testid={`evidence-${item.ref}`}
      className={`scroll-mt-6 rounded-lg border px-4 py-3.5 transition-colors duration-300 ${
        highlighted ? 'border-info bg-info-bg' : 'border-line bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`tnum mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
            isKnowledge
              ? 'border-warn-line bg-warn-bg text-warn'
              : 'border-info-line bg-info-bg text-info'
          }`}
        >
          {item.ref}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[13px] leading-snug font-semibold text-ink">{item.title}</h3>
            <Badge value={item.kind} tone="neutral" />
          </div>
          <pre className="mt-2 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {item.content}
          </pre>
          <p className="tnum mt-2 text-[11px] text-ink-3">{item.source}</p>
        </div>
      </div>
    </article>
  )
}

function RemediationPanel({ incidentId, plan }: { incidentId: number; plan: Plan }) {
  const approve = useApprove()
  const reject = useReject()
  const pending = plan.status === 'awaiting_approval'
  const dryRun = plan.status === 'dry_run'

  return (
    <div data-testid="remediation-plan" className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <code className="min-w-0 rounded-md border border-line bg-sunken px-2 py-1 text-[13px] font-semibold break-all text-ink">
          {plan.action_id}
        </code>
        <div className="flex flex-wrap items-center gap-2">
          <Badge value={plan.risk} label={`${plan.risk} risk`} />
          <Badge value={plan.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {Object.entries(plan.params).map(([key, value]) => (
          <Field key={key} label={key}>
            <span className="tnum">{String(value)}</span>
          </Field>
        ))}
      </div>

      <dl className="space-y-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <div>
          <dt className="inline font-semibold text-ink">Rationale. </dt>
          <dd className="inline">{plan.rationale}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Expected effect. </dt>
          <dd className="inline">{plan.expected_effect}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Rollback. </dt>
          <dd className="inline">{plan.rollback}</dd>
        </div>
      </dl>

      {typeof plan.result?.detail === 'string' && (
        <p
          className={`rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
            dryRun
              ? 'border-warn-line bg-warn-bg text-warn'
              : 'border-line bg-sunken text-ink-2'
          }`}
        >
          {plan.result.detail}
        </p>
      )}

      {pending ? (
        <div className="space-y-2.5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="approve"
              icon={<IconCheck size={14} />}
              disabled={approve.isPending}
              onClick={() => approve.mutate({ incidentId, planId: plan.id, approver: 'operator' })}
            >
              {approve.isPending ? 'Executing…' : 'Approve and execute'}
            </Button>
            <Button
              variant="danger"
              icon={<IconX size={14} />}
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
          <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <IconShield size={13} />
            Nothing runs without approval.
          </p>
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
    <div className="space-y-5">
      <header className="space-y-4">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-200 hover:text-ink"
        >
          <IconArrowLeft size={13} />
          All investigations
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-[22px] leading-tight font-bold tracking-tight text-ink"
              data-testid="incident-title"
            >
              {incident.title}
            </h1>
            <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
              #{incident.id} · {incident.service} · {incident.detector} ·{' '}
              {fmtAgo(incident.opened_at)}
            </p>
          </div>
          <div className="flex items-center gap-2" data-testid="incident-status">
            <Badge value={incident.severity} />
            <Badge value={incident.status} />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-card px-5 py-3.5 shadow-xs">
          <WorkflowTrack state={incident.workflow_state} />
        </div>
      </header>

      {incident.workflow_error && (
        <Card title="Workflow error">
          <p className="tnum text-[12.5px] text-alarm">{incident.workflow_error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Assessment" hint="written from cited evidence">
            <p className="text-[13.5px] leading-relaxed text-ink" data-testid="incident-summary">
              {incident.summary || 'Investigation in progress…'}
            </p>
            {incident.root_cause && (
              <div className="mt-4 rounded-lg border border-info-line bg-info-bg px-4 py-3">
                <div className="text-[11px] font-semibold tracking-wide text-info uppercase">
                  Root cause
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed font-medium text-ink">
                  {incident.root_cause}
                </p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3.5 text-[11.5px] text-ink-3">
              <span className="flex items-center gap-1.5">
                <IconGauge size={13} />
                {telemetry.length} evidence items
              </span>
              <span className="flex items-center gap-1.5">
                <IconDoc size={13} />
                {knowledge.length} documents retrieved
              </span>
              {incident.llm_usage?.calls ? (
                <span className="tnum">
                  {incident.llm_usage.calls} reasoning calls · {incident.llm_usage.input_tokens}/
                  {incident.llm_usage.output_tokens} tokens · $
                  {(incident.llm_usage.cost_usd ?? 0).toFixed(4)}
                </span>
              ) : (
                <span>Deterministic provider · no model calls</span>
              )}
            </div>
          </Card>

          <Card
            title="Root cause hypotheses"
            hint="generated, criticised, then ranked"
            bodyClass="space-y-3 p-3"
          >
            {incident.hypotheses.length ? (
              incident.hypotheses.map((h) => (
                <HypothesisCard key={h.id} hypothesis={h} onSelect={selectCitation} />
              ))
            ) : (
              <Empty>No hypotheses yet.</Empty>
            )}
          </Card>

          <Card title={`${incident.service} p95 latency`} hint="origin service">
            {metrics?.length ? (
              <MetricChart data={metrics} metric="latency_p95_ms" height={160} />
            ) : (
              <Empty>No telemetry.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Proposed remediation" hint="one action from the allowlist">
            {plan ? (
              <RemediationPanel incidentId={incident.id} plan={plan} />
            ) : (
              <Empty>No plan proposed yet.</Empty>
            )}
          </Card>

          <Card
            title="Evidence"
            hint={`${telemetry.length} telemetry · ${knowledge.length} retrieved`}
            bodyClass="max-h-[720px] space-y-3 overflow-y-auto p-3"
          >
            {telemetry.map((item) => (
              <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
            ))}
            {knowledge.length > 0 && (
              <p className="px-1 pt-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                Retrieved documents
              </p>
            )}
            {knowledge.map((item) => (
              <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
            ))}
          </Card>
        </div>
      </div>

      <Card title="Audit timeline" hint="actions performed and decisions made" bodyClass="p-0">
        <ol data-testid="timeline">
          {incident.events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line px-5 py-3 first:border-t-0"
            >
              <span className="tnum w-16 shrink-0 text-[11.5px] text-ink-3">
                {fmtTime(event.ts)}
              </span>
              <span className="w-44 shrink-0">
                <Badge value={event.kind} />
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
