import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type { IncidentDetail, SystemStatus } from '../api/types'

export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

export function renderRoute(path: string, element: ReactElement, route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export const statusFixture: SystemStatus = {
  healthy: false,
  active_incidents: 1,
  provider: 'offline-heuristic',
  model: 'rules/v1',
  knowledge_chunks: 96,
  simulator: {
    healthy: false,
    active_scenarios: ['checkout_latency_regression'],
    applied_actions: [],
    tick: 12,
  },
  services: [
    {
      name: 'gateway',
      tier: 'edge',
      description: 'Public API gateway.',
      depends_on: ['auth-service', 'checkout-service'],
      status: 'degraded',
      latency_p50_ms: 400,
      latency_p95_ms: 870,
      error_rate: 0.003,
      rps: 850,
      saturation: 0.5,
      slo_latency_p95_ms: 400,
      slo_error_rate: 0.02,
      breaches: ['gateway latency_p95 870ms over SLO 400ms'],
    },
    {
      name: 'checkout-service',
      tier: 'application',
      description: 'Cart pricing and order placement.',
      depends_on: ['payments-db'],
      status: 'degraded',
      latency_p50_ms: 494,
      latency_p95_ms: 1092,
      error_rate: 0.009,
      rps: 320,
      saturation: 0.76,
      slo_latency_p95_ms: 600,
      slo_error_rate: 0.02,
      breaches: ['checkout-service latency_p95 1092ms over SLO 600ms'],
    },
    {
      name: 'payments-db',
      tier: 'datastore',
      description: 'Primary PostgreSQL cluster.',
      depends_on: [],
      status: 'healthy',
      latency_p50_ms: 12,
      latency_p95_ms: 38,
      error_rate: 0.0005,
      rps: 640,
      saturation: 0.45,
      slo_latency_p95_ms: 150,
      slo_error_rate: 0.01,
      breaches: [],
    },
  ],
}

export const incidentFixture: IncidentDetail = {
  id: 7,
  title: 'checkout-service: latency SLO breach',
  service: 'checkout-service',
  severity: 'SEV2',
  status: 'awaiting_approval',
  workflow_state: 'awaiting_approval',
  detector: 'slo_breach_rule/v1',
  summary: 'checkout-service p95 latency is 5.1x baseline with a flat error rate.',
  root_cause: 'Release 4.12.0 moved pricing into the per-item loop.',
  opened_at: '2026-09-02T10:00:00Z',
  resolved_at: null,
  scenario: 'checkout_latency_regression',
  trigger: {},
  workflow_error: '',
  llm_usage: { calls: 4, input_tokens: 9100, output_tokens: 1400, cost_usd: 0.0805 },
  events: [
    {
      id: 1,
      ts: '2026-09-02T10:00:00Z',
      kind: 'detected',
      actor: 'detector',
      message: 'SEV2 opened by slo_breach_rule/v1.',
      data: {},
    },
    {
      id: 2,
      ts: '2026-09-02T10:00:02Z',
      kind: 'remediation_proposed',
      actor: 'aegis',
      message: 'Proposed rollback_deployment on checkout-service.',
      data: {},
    },
  ],
  evidence: [
    {
      id: 11,
      ref: 'E1',
      kind: 'metrics',
      source: 'metrics store',
      title: 'checkout-service current telemetry vs baseline',
      content: 'p95 latency 1092ms (5.20x baseline 210ms)',
      data: { role: 'origin' },
    },
    {
      id: 12,
      ref: 'K1',
      kind: 'knowledge',
      source: 'runbooks/latency-regression-after-release.md',
      title: 'Runbook - Latency Regression After a Release',
      content: 'Roll back the offending release.',
      data: {},
    },
  ],
  hypotheses: [
    {
      id: 21,
      rank: 1,
      cause_type: 'bad_deploy',
      statement: 'Release 4.12.0 added per-request work to checkout-service.',
      mechanism: 'p95 is 5.2x baseline with a flat error rate and healthy dependencies.',
      suspect_service: 'checkout-service',
      confidence: 0.84,
      citations: ['E1', 'K1'],
      verdict: 'supported',
      support_score: 0.85,
      critic_note: 'Every cited reference resolves.',
      unsupported_claims: [],
      final_score: 0.79,
    },
    {
      id: 22,
      rank: 2,
      cause_type: 'dependency_failure',
      statement: 'A dependency is degraded.',
      mechanism: 'Considered because degradation propagates.',
      suspect_service: 'checkout-service',
      confidence: 0.2,
      citations: ['E1'],
      verdict: 'contradicted',
      support_score: 0.05,
      critic_note: 'Every dependency is inside its SLO.',
      unsupported_claims: ['claims a dependency is degraded, but every dependency is inside SLO'],
      final_score: 0.03,
    },
  ],
  plans: [
    {
      id: 31,
      action_id: 'rollback_deployment',
      params: { service: 'checkout-service' },
      rationale: 'The leading hypothesis is a bad deploy.',
      expected_effect: 'p95 returns inside SLO within two windows.',
      rollback: 'Redeploy once a fix exists.',
      risk: 'medium',
      citations: ['E1'],
      status: 'awaiting_approval',
      approved_by: '',
      approved_at: null,
      executed_at: null,
      result: {},
    },
  ],
}
