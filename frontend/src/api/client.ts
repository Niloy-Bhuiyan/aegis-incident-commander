import type {
  ActionSpec,
  ChangeEntry,
  DocumentDetail,
  DocumentSummary,
  IncidentDetail,
  IncidentSummary,
  MetricPoint,
  Scenario,
  SearchHit,
  SystemStatus,
  Topology,
} from './types'

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const TOKEN = import.meta.env.VITE_AEGIS_API_TOKEN ?? 'dev-local-token'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.method === 'POST' ? { 'X-Aegis-Token': TOKEN } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      detail = (await response.json()).detail ?? detail
    } catch {
      // response had no JSON body; the status text is the best available message
    }
    throw new ApiError(detail, response.status)
  }
  return response.json() as Promise<T>
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  systemStatus: () => request<SystemStatus>('/api/system/status'),
  topology: () => request<Topology>('/api/system/topology'),
  serviceMetrics: (name: string, limit = 60) =>
    request<MetricPoint[]>(`/api/services/${name}/metrics?limit=${limit}`),
  changes: (limit = 20) => request<ChangeEntry[]>(`/api/changes?limit=${limit}`),
  actions: () => request<ActionSpec[]>('/api/actions'),

  incidents: () => request<IncidentSummary[]>('/api/incidents'),
  incident: (id: number) => request<IncidentDetail>(`/api/incidents/${id}`),
  approve: (incidentId: number, planId: number, approver: string) =>
    post<Record<string, unknown>>(`/api/incidents/${incidentId}/plans/${planId}/approve`, {
      approver,
    }),
  reject: (incidentId: number, planId: number, approver: string, reason: string) =>
    post<Record<string, unknown>>(`/api/incidents/${incidentId}/plans/${planId}/reject`, {
      approver,
      reason,
    }),

  documents: () => request<DocumentSummary[]>('/api/knowledge/documents'),
  document: (id: number) => request<DocumentDetail>(`/api/knowledge/documents/${id}`),
  search: (q: string, k = 6) =>
    request<SearchHit[]>(`/api/knowledge/search?q=${encodeURIComponent(q)}&k=${k}`),

  scenarios: () => request<Scenario[]>('/api/demo/scenarios'),
  inject: (scenarioId: string) =>
    post<Record<string, unknown>>('/api/demo/inject', { scenario_id: scenarioId }),
  restore: () => post<Record<string, unknown>>('/api/demo/restore'),
  tick: (count = 1) => post<Record<string, unknown>>(`/api/demo/tick?count=${count}`),
}
