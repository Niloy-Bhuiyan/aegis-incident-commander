import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { Evidence, Hypothesis, Plan } from '../api/types'
import { MetricChart } from '../components/MetricChart'
import { Button, Card, Empty, Pill, fmtTime } from '../components/ui'
import { useApprove, useIncident, useReject, useServiceMetrics } from '../hooks/queries'

const WORKFLOW_STEPS = [
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
  const index = WORKFLOW_STEPS.indexOf(state)
  return (
    <ol className="flex flex-wrap gap-1.5" data-testid="workflow-track">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = index >= 0 && i < index
        const current = step === state
        return (
          <li
            key={step}
            className={`rounded-md border px-2 py-1 text-[10px] tracking-wide ${
              current
                ? 'border-signal-500/50 bg-signal-500/15 text-signal-400'
                : done
                  ? 'border-ok-500/30 bg-ok-500/10 text-ok-500'
                  : 'border-ink-700 bg-ink-850/60 text-mist-400'
            }`}
          >
            {step.replace(/_/g, ' ')}
          </li>
        )
      })}
    </ol>
  )
}

function CitationChip({ refId, onSelect }: { refId: string; onSelect: (ref: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(refId)}
      className="rounded border border-signal-500/30 bg-signal-500/10 px-1.5 py-0.5 font-mono text-[10px] text-signal-400 transition hover:bg-signal-500/25"
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
      className={`rounded-lg border px-4 py-3 ${
        leading ? 'border-signal-500/40 bg-signal-500/5' : 'border-ink-800 bg-ink-850/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-mist-400">#{hypothesis.rank}</span>
          <Pill value={hypothesis.cause_type} />
          {leading && <Pill value="supported" label="leading" />}
        </div>
        <div className="flex items-center gap-2">
          <Pill value={hypothesis.verdict} />
          <span className="font-mono text-[11px] text-mist-400">
            score {hypothesis.final_score.toFixed(2)}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-mist-100">{hypothesis.statement}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-mist-300">{hypothesis.mechanism}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-mist-400">Cites</span>
        {hypothesis.citations.length ? (
          hypothesis.citations.map((c) => <CitationChip key={c} refId={c} onSelect={onSelect} />)
        ) : (
          <span className="text-[11px] text-alarm-500">no citations</span>
        )}
        <span className="ml-2 text-[11px] text-mist-400">
          confidence {(hypothesis.confidence * 100).toFixed(0)}% · critic support{' '}
          {(hypothesis.support_score * 100).toFixed(0)}%
        </span>
      </div>

      {hypothesis.critic_note && (
        <p className="mt-2 rounded border border-ink-700 bg-ink-900/60 px-3 py-2 text-[11px] leading-relaxed text-mist-300">
          <span className="font-medium text-mist-100">Critic: </span>
          {hypothesis.critic_note}
        </p>
      )}

      {hypothesis.unsupported_claims.length > 0 && (
        <ul className="mt-2 space-y-1">
          {hypothesis.unsupported_claims.map((claim) => (
            <li key={claim} className="text-[11px] text-warn-500">
              Unsupported: {claim}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function EvidenceCard({ item, highlighted }: { item: Evidence; highlighted: boolean }) {
  return (
    <article
      id={`evidence-${item.ref}`}
      data-testid={`evidence-${item.ref}`}
      className={`rounded-lg border px-4 py-3 transition ${
        highlighted ? 'border-signal-500 bg-signal-500/10' : 'border-ink-800 bg-ink-850/50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded border border-signal-500/30 bg-signal-500/10 px-1.5 py-0.5 font-mono text-[10px] text-signal-400">
            {item.ref}
          </span>
          <span className="text-sm text-mist-100">{item.title}</span>
        </div>
        <Pill value={item.kind} />
      </div>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-mist-300">
        {item.content}
      </pre>
      <p className="mt-1.5 font-mono text-[10px] text-mist-400">{item.source}</p>
    </article>
  )
}

function RemediationPanel({ incidentId, plan }: { incidentId: number; plan: Plan }) {
  const approve = useApprove()
  const reject = useReject()
  const pending = plan.status === 'awaiting_approval'

  return (
    <div data-testid="remediation-plan" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-signal-400">{plan.action_id}</span>
          <Pill value={plan.risk} label={`${plan.risk} risk`} />
        </div>
        <Pill value={plan.status} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        {Object.entries(plan.params).map(([key, value]) => (
          <div key={key} className="rounded border border-ink-800 bg-ink-900/60 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-mist-400">{key}</dt>
            <dd className="mt-0.5 font-mono text-mist-100">{String(value)}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2 text-xs leading-relaxed text-mist-300">
        <p>
          <span className="font-medium text-mist-100">Rationale. </span>
          {plan.rationale}
        </p>
        <p>
          <span className="font-medium text-mist-100">Expected effect. </span>
          {plan.expected_effect}
        </p>
        <p>
          <span className="font-medium text-mist-100">Rollback. </span>
          {plan.rollback}
        </p>
      </div>

      {plan.result?.detail !== undefined && (
        <p className="rounded border border-ink-700 bg-ink-900/60 px-3 py-2 text-[11px] text-mist-300">
          {String(plan.result.detail)}
        </p>
      )}

      {pending ? (
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="primary"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate({ incidentId, planId: plan.id, approver: 'operator' })
            }
          >
            {approve.isPending ? 'Executing...' : 'Approve and execute'}
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
      ) : (
        <p className="text-[11px] text-mist-400">
          {plan.approved_by ? `Actioned by ${plan.approved_by}` : 'No operator action recorded'}
          {plan.executed_at ? ` · executed ${fmtTime(plan.executed_at)}` : ''}
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
    document.getElementById(`evidence-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (isLoading) return <Empty>Loading investigation.</Empty>
  if (!incident) return <Empty>Incident not found.</Empty>

  const telemetry = incident.evidence.filter((e) => e.kind !== 'knowledge')
  const knowledge = incident.evidence.filter((e) => e.kind === 'knowledge')
  const plan = incident.plans.at(-1)

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link to="/incidents" className="text-xs text-mist-400 hover:text-mist-100">
          &larr; All investigations
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="incident-title">
              {incident.title}
            </h1>
            <p className="mt-1 text-sm text-mist-400">
              #{incident.id} · {incident.service} · detected by {incident.detector} ·{' '}
              {fmtTime(incident.opened_at)}
            </p>
          </div>
          <div className="flex items-center gap-2" data-testid="incident-status">
            <Pill value={incident.severity} />
            <Pill value={incident.status} />
          </div>
        </div>
        <WorkflowTrack state={incident.workflow_state} />
      </header>

      {incident.workflow_error && (
        <Card title="Workflow error">
          <p className="font-mono text-xs text-alarm-500">{incident.workflow_error}</p>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2" title="Summary" subtitle="Written from the cited evidence">
          <p className="text-sm leading-relaxed text-mist-100" data-testid="incident-summary">
            {incident.summary || 'Investigation in progress.'}
          </p>
          {incident.root_cause && (
            <p className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm leading-relaxed text-mist-100">
              <span className="font-medium text-signal-400">Root cause. </span>
              {incident.root_cause}
            </p>
          )}
          {incident.llm_usage?.calls ? (
            <p className="mt-3 text-[11px] text-mist-400">
              {incident.llm_usage.calls} reasoning calls · {incident.llm_usage.input_tokens} in /{' '}
              {incident.llm_usage.output_tokens} out tokens · $
              {(incident.llm_usage.cost_usd ?? 0).toFixed(4)}
            </p>
          ) : null}
        </Card>

        <Card title={`${incident.service} p95 latency`}>
          {metrics?.length ? (
            <MetricChart data={metrics} metric="latency_p95_ms" />
          ) : (
            <Empty>No telemetry.</Empty>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card
          title="Root cause hypotheses"
          subtitle="Generated, then reviewed by an adversarial critic, then ranked"
        >
          {incident.hypotheses.length ? (
            <div className="space-y-3">
              {incident.hypotheses.map((h) => (
                <HypothesisCard key={h.id} hypothesis={h} onSelect={selectCitation} />
              ))}
            </div>
          ) : (
            <Empty>No hypotheses yet.</Empty>
          )}
        </Card>

        <Card
          title="Proposed remediation"
          subtitle="One action from the approved catalogue. Nothing runs without approval."
        >
          {plan ? <RemediationPanel incidentId={incident.id} plan={plan} /> : <Empty>No plan yet.</Empty>}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card title="Evidence" subtitle="Collected deterministically from telemetry and the change log">
          <div className="space-y-3">
            {telemetry.map((item) => (
              <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
            ))}
          </div>
        </Card>

        <Card title="Retrieved documents" subtitle="Hybrid BM25 + dense retrieval over the knowledge base">
          {knowledge.length ? (
            <div className="space-y-3">
              {knowledge.map((item) => (
                <EvidenceCard key={item.id} item={item} highlighted={highlight === item.ref} />
              ))}
            </div>
          ) : (
            <Empty>Nothing retrieved.</Empty>
          )}
        </Card>
      </div>

      <Card title="Audit timeline" subtitle="Actions performed and decisions made">
        <ol className="space-y-2" data-testid="timeline">
          {incident.events.map((event) => (
            <li
              key={event.id}
              className="flex gap-3 rounded-lg border border-ink-800 bg-ink-850/50 px-4 py-2.5"
            >
              <span className="w-20 shrink-0 font-mono text-[11px] text-mist-400">
                {fmtTime(event.ts)}
              </span>
              <span className="w-44 shrink-0">
                <Pill value={event.kind} />
              </span>
              <span className="flex-1 text-xs leading-relaxed text-mist-300">{event.message}</span>
              <span className="shrink-0 font-mono text-[10px] text-mist-400">{event.actor}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
