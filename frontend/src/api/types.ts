export type ServiceHealth = {
  name: string
  tier: string
  description: string
  depends_on: string[]
  status: 'healthy' | 'degraded' | 'unknown'
  latency_p50_ms: number | null
  latency_p95_ms: number | null
  error_rate: number | null
  rps: number | null
  saturation: number | null
  slo_latency_p95_ms: number
  slo_error_rate: number
  breaches: string[]
}

export type SystemStatus = {
  healthy: boolean
  services: ServiceHealth[]
  active_incidents: number
  // Shape depends on the configured telemetry source, so nothing is guaranteed.
  telemetry: {
    source?: string
    healthy?: boolean
    supports_remediation?: boolean
    // simulator only
    active_scenarios?: string[]
    applied_actions?: {
      action_id: string
      service: string
      params: Record<string, unknown>
      at: string
      resolved_fault: boolean
    }[]
    tick?: number
    // prometheus only
    url?: string
    services?: string[]
    last_error?: string | null
    last_collect?: string | null
    missing_signals?: Record<string, string[]>
  }
  provider: string
  model: string
  knowledge_chunks: number
}

export type MetricPoint = {
  ts: string
  latency_p50_ms: number
  latency_p95_ms: number
  error_rate: number
  rps: number
  saturation: number
}

export type ChangeEntry = {
  id: number
  service: string
  kind: string
  version: string
  ts: string
  change_summary: string
  risk: string
}

export type Topology = {
  nodes: {
    id: string
    tier: string
    description: string
    status: string
    latency_p95_ms: number | null
    error_rate: number | null
    saturation: number | null
  }[]
  edges: { source: string; target: string }[]
}

export type IncidentSummary = {
  id: number
  title: string
  service: string
  severity: string
  status: string
  workflow_state: string
  detector: string
  summary: string
  root_cause: string
  opened_at: string
  resolved_at: string | null
  scenario: string
}

export type IncidentEvent = {
  id: number
  ts: string
  kind: string
  actor: string
  message: string
  data: Record<string, unknown>
}

export type Evidence = {
  id: number
  ref: string
  kind: string
  source: string
  title: string
  content: string
  data: Record<string, unknown>
}

export type Hypothesis = {
  id: number
  rank: number
  cause_type: string
  statement: string
  mechanism: string
  suspect_service: string
  confidence: number
  citations: string[]
  verdict: string
  support_score: number
  critic_note: string
  unsupported_claims: string[]
  final_score: number
}

export type Plan = {
  id: number
  action_id: string
  params: Record<string, unknown>
  rationale: string
  expected_effect: string
  rollback: string
  risk: string
  citations: string[]
  status: string
  approved_by: string
  approved_at: string | null
  executed_at: string | null
  result: Record<string, unknown>
}

export type IncidentDetail = IncidentSummary & {
  trigger: Record<string, unknown>
  workflow_error: string
  llm_usage: Record<string, number>
  events: IncidentEvent[]
  evidence: Evidence[]
  hypotheses: Hypothesis[]
  plans: Plan[]
}

export type DocumentSummary = {
  id: number
  path: string
  title: string
  doc_type: string
  service: string
  tags: string[]
  chunks: number
  updated_at: string
}

export type DocumentDetail = DocumentSummary & { content: string }

export type SearchHit = {
  ref: string
  chunk_id: number
  document_id: number
  title: string
  path: string
  doc_type: string
  service: string
  heading: string
  text: string
  score: number
  lexical_rank: number | null
  dense_rank: number | null
}

export type Scenario = {
  id: string
  title: string
  description: string
  primary_service: string
}

export type ActionSpec = {
  id: string
  title: string
  description: string
  risk: string
  rollback: string
  params: {
    name: string
    kind: string
    required: boolean
    minimum: number | null
    maximum: number | null
    choices: string[] | null
    description: string
  }[]
}
