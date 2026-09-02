import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { Evidence, Hypothesis, Plan } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { IconArrowLeft, IconCheck, IconDoc, IconGauge, IconShield, IconX } from '../components/icons'
import {
  Badge,
  Button,
  Empty,
  Field,
  Panel,
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

const SHORT: Record<string, string> = {
  detected: 'detect',
  collecting_evidence: 'evidence',
  retrieving_knowledge: 'retrieve',
  generating_hypotheses: 'hypothesise',
  critiquing: 'critique',
  ranking: 'rank',
  planning_remediation: 'plan',
  awaiting_approval: 'approval',
  executing: 'execute',
  verifying: 'verify',
  resolved: 'resolved',
}

/** The pipeline as a segmented bar: position in the run, not a pile of chips. */
function WorkflowTrack({ state }: { state: string }) {
  const index = STEPS.indexOf(state)
  const failed = state === 'failed' || state === 'awaiting_execution'

  return (
    <ol
      className="flex w-full items-stretch gap-px overflow-hidden rounded-sm border border-line"
      data-testid="workflow-track"
      aria-label={`Workflow position: ${state.replace(/_/g, ' ')}`}
    >
      {STEPS.map((step, i) => {
        const done = index >= 0 && i < index
        const current = step === state
        return (
          <li
            key={step}
            title={step.replace(/_/g, ' ')}
            className={`flex min-w-0 flex-1 items-center justify-center px-1 py-1 text-[9.5px] whitespace-nowrap transition-colors duration-150 ${
              current
                ? 'bg-info-dim font-semibold text-info'
                : done
                  ? 'bg-ok-dim/60 text-ok'
                  : 'bg-raised text-fg-3'
            }`}
          >
            <span className="truncate">
              {current ? step.replace(/_/g, ' ') : SHORT[step]}
            </span>
          </li>
        )
      })}
      {failed && (
        <li className="flex items-center bg-warn-dim px-2 py-1 text-[9.5px] text-warn">
          {state.replace(/_/g, ' ')}
        </li>
      )}
    </ol>
  )
}

function Citation({ refId, onSelect }: { refId: string; onSelect: (ref: string) => void }) {
  const isKnowledge = refId.startsWith('K')
  return (
    <button
      type="button"
      onClick={() => onSelect(refId)}
      title={`Show ${isKnowledge ? 'document' : 'evidence'} ${refId}`}
      className={`tnum rounded-xs border px-1 py-px text-[10px] transition-colors duration-150 ${
        isKnowledge
          ? 'border-warn/30 bg-warn-dim text-warn hover:bg-warn/20'
          : 'border-info/30 bg-info-dim text-info hover:bg-info/20'
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
  const tone = toneFor(hypothesis.verdict)

  return (
    <article
      data-testid={`hypothesis-${hypothesis.rank}`}
      className={`rounded-sm border px-2.5 py-2 ${
        leading ? 'border-info/35 bg-info-dim/40' : 'border-line bg-raised'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tnum text-[10px] text-fg-3">#{hypothesis.rank}</span>
        <Badge value={hypothesis.cause_type} tone={leading ? 'info' : 'neutral'} />
        {leading && <Badge value="leading" tone="info" />}
        <span className="ml-auto flex items-center gap-1.5">
          <Badge value={hypothesis.verdict} tone={tone} />
          <span className="tnum text-[10px] text-fg-3">
            {hypothesis.final_score.toFixed(2)}
          </span>
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-snug text-fg">{hypothesis.statement}</p>
      <p className="mt-1 text-[11px] leading-snug text-fg-2">{hypothesis.mechanism}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {hypothesis.citations.length ? (
          hypothesis.citations.map((c) => (
            <Citation key={c} refId={c} onSelect={onSelect} />
          ))
        ) : (
          <span className="text-[10px] text-alarm">no citations</span>
        )}
        <span className="tnum ml-1 text-[10px] text-fg-3">
          conf {(hypothesis.confidence * 100).toFixed(0)}% · support{' '}
          {(hypothesis.support_score * 100).toFixed(0)}%
        </span>
      </div>

      {hypothesis.critic_note && (
        <p className="mt-1.5 border-l-2 border-line-strong pl-2 text-[10.5px] leading-snug text-fg-2">
          <span className="font-medium text-fg">Critic. </span>
          {hypothesis.critic_note}
        </p>
      )}

      {hypothesis.unsupported_claims.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {hypothesis.unsupported_claims.map((claim) => (
            <li key={claim} className="flex gap-1.5 text-[10.5px] leading-snug text-warn">
              <span aria-hidden>▲</span>
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
      className={`scroll-mt-4 rounded-sm border px-2.5 py-2 transition-colors duration-200 ${
        highlighted ? 'border-info bg-info-dim' : 'border-line bg-raised'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`tnum mt-px shrink-0 rounded-xs border px-1 py-px text-[10px] ${
            isKnowledge
              ? 'border-warn/30 bg-warn-dim text-warn'
              : 'border-info/30 bg-info-dim text-info'
          }`}
        >
          {item.ref}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[11.5px] leading-snug font-medium text-fg">{item.title}</h3>
            <Badge value={item.kind} tone="neutral" />
          </div>
          <pre className="mt-1 font-sans text-[11px] leading-snug whitespace-pre-wrap text-fg-2">
            {item.content}
          </pre>
          <p className="tnum mt-1 text-[10px] text-fg-3">{item.source}</p>
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
    <div data-testid="remediation-plan" className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <code className="rounded-xs border border-info/25 bg-info-dim px-1.5 py-0.5 text-[11px] text-info">
            {plan.action_id}
          </code>
          <Badge value={plan.risk} label={`${plan.risk} risk`} />
        </div>
        <span className="shrink-0">
          <Badge value={plan.status} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(plan.params).map(([key, value]) => (
          <Field key={key} label={key}>
            <span className="tnum">{String(value)}</span>
          </Field>
        ))}
      </div>

      <dl className="space-y-1.5 text-[11px] leading-snug text-fg-2">
        <div>
          <dt className="inline font-medium text-fg">Rationale. </dt>
          <dd className="inline">{plan.rationale}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-fg">Expected effect. </dt>
          <dd className="inline">{plan.expected_effect}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-fg">Rollback. </dt>
          <dd className="inline">{plan.rollback}</dd>
        </div>
      </dl>

      {typeof plan.result?.detail === 'string' && (
        <p
          className={`rounded-sm border px-2 py-1.5 text-[11px] leading-snug ${
            dryRun ? 'border-warn/30 bg-warn-dim text-warn' : 'border-line bg-raised text-fg-2'
          }`}
        >
          {plan.result.detail}
        </p>
      )}

      {pending ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
          <Button
            variant="approve"
            icon={<IconCheck size={13} />}
            disabled={approve.isPending}
            onClick={() => approve.mutate({ incidentId, planId: plan.id, approver: 'operator' })}
          >
            {approve.isPending ? 'Executing…' : 'Approve and execute'}
          </Button>
          <Button
            variant="danger"
            icon={<IconX size={13} />}
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
          <span className="ml-auto flex items-center gap-1 text-[10px] text-fg-3">
            <IconShield size={12} />
            nothing runs without approval
          </span>
        </div>
      ) : (
        <p className="tnum border-t border-line pt-2 text-[10px] text-fg-3">
          {plan.approved_by ? `actioned by ${plan.approved_by}` : 'no operator action recorded'}
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
    <div className="space-y-3">
      <header className="space-y-2">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1 text-[11px] text-fg-3 transition-colors duration-150 hover:text-fg"
        >
          <IconArrowLeft size={12} />
          All investigations
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1
              className="text-base leading-tight font-semibold tracking-tight"
              data-testid="incident-title"
            >
              {incident.title}
            </h1>
            <p className="tnum mt-0.5 text-[11px] text-fg-3">
              #{incident.id} · {incident.service} · {incident.detector} ·{' '}
              {fmtAgo(incident.opened_at)}
            </p>
          </div>
          <div className="flex items-center gap-1.5" data-testid="incident-status">
            <Badge value={incident.severity} />
            <Badge value={incident.status} />
          </div>
        </div>

        <WorkflowTrack state={incident.workflow_state} />
      </header>

      {incident.workflow_error && (
        <Panel title="Workflow error">
          <p className="tnum text-[11px] text-alarm">{incident.workflow_error}</p>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Panel title="Assessment" hint="written from cited evidence">
            <p className="text-xs leading-relaxed text-fg" data-testid="incident-summary">
              {incident.summary || 'Investigation in progress…'}
            </p>
            {incident.root_cause && (
              <p className="mt-2 rounded-sm border-l-2 border-info bg-raised px-2.5 py-1.5 text-xs leading-relaxed text-fg">
                <span className="font-medium text-info">Root cause. </span>
                {incident.root_cause}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[10px] text-fg-3">
              <span className="flex items-center gap-1">
                <IconGauge size={11} />
                {telemetry.length} evidence items
              </span>
              <span className="flex items-center gap-1">
                <IconDoc size={11} />
                {knowledge.length} documents retrieved
              </span>
              {incident.llm_usage?.calls ? (
                <span className="tnum">
                  {incident.llm_usage.calls} reasoning calls ·{' '}
                  {incident.llm_usage.input_tokens}/{incident.llm_usage.output_tokens} tok · $
                  {(incident.llm_usage.cost_usd ?? 0).toFixed(4)}
                </span>
              ) : (
                <span>deterministic provider · no model calls</span>
              )}
            </div>
          </Panel>

          <Panel
            title="Root cause hypotheses"
            hint="generated, criticised, then ranked"
            bodyClass="space-y-1.5 p-2"
          >
            {incident.hypotheses.length ? (
              incident.hypotheses.map((h) => (
                <HypothesisCard key={h.id} hypothesis={h} onSelect={selectCitation} />
              ))
            ) : (
              <Empty>No hypotheses yet.</Empty>
            )}
          </Panel>

          <Panel title={`${incident.service} p95 latency`} hint="origin service">
            {metrics?.length ? (
              <MetricChart data={metrics} metric="latency_p95_ms" height={130} />
            ) : (
              <Empty>No telemetry.</Empty>
            )}
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel title="Proposed remediation" hint="one action from the allowlist">
            {plan ? (
              <RemediationPanel incidentId={incident.id} plan={plan} />
            ) : (
              <Empty>No plan proposed yet.</Empty>
            )}
          </Panel>

          <Panel
            title="Evidence"
            hint={`${telemetry.length} telemetry · ${knowledge.length} retrieved`}
            bodyClass="max-h-[640px] space-y-1.5 overflow-y-auto p-2"
          >
            {telemetry.map((item) => (
              <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
            ))}
            {knowledge.length > 0 && (
              <p className="px-0.5 pt-1.5 text-[9.5px] uppercase tracking-[0.08em] text-fg-3">
                Retrieved documents
              </p>
            )}
            {knowledge.map((item) => (
              <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
            ))}
          </Panel>
        </div>
      </div>

      <Panel title="Audit timeline" hint="actions performed and decisions made" bodyClass="p-0">
        <ol data-testid="timeline">
          {incident.events.map((event) => (
            <li
              key={event.id}
              className="flex gap-2 border-t border-line px-3 py-1.5 first:border-t-0"
            >
              <span className="tnum w-16 shrink-0 text-[10px] text-fg-3">
                {fmtTime(event.ts)}
              </span>
              <span className="w-40 shrink-0">
                <Badge value={event.kind} />
              </span>
              <span className="min-w-0 flex-1 text-[11px] leading-snug text-fg-2">
                {event.message}
              </span>
              <span className="tnum hidden w-20 shrink-0 text-right text-[10px] text-fg-3 sm:block">
                {event.actor}
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
