import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../api/client'

const LIVE = 2000

export const useSystemStatus = () =>
  useQuery({ queryKey: ['status'], queryFn: api.systemStatus, refetchInterval: LIVE })

export const useTopology = () =>
  useQuery({ queryKey: ['topology'], queryFn: api.topology, refetchInterval: LIVE })

export const useServiceMetrics = (name: string) =>
  useQuery({
    queryKey: ['metrics', name],
    queryFn: () => api.serviceMetrics(name),
    refetchInterval: LIVE,
  })

export const useAllServiceMetrics = () =>
  useQuery({
    queryKey: ['metrics', 'all'],
    queryFn: () => api.allServiceMetrics(),
    refetchInterval: LIVE,
  })

export const useChanges = () =>
  useQuery({ queryKey: ['changes'], queryFn: () => api.changes(), refetchInterval: LIVE * 3 })

export const useIncidents = () =>
  useQuery({ queryKey: ['incidents'], queryFn: api.incidents, refetchInterval: LIVE })

export const useIncident = (id: number) =>
  useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.incident(id),
    refetchInterval: LIVE,
    enabled: Number.isFinite(id),
  })

export const useDocuments = () => useQuery({ queryKey: ['documents'], queryFn: api.documents })

export const useDocument = (id: number | null) =>
  useQuery({
    queryKey: ['document', id],
    queryFn: () => api.document(id as number),
    enabled: id !== null,
  })

export const useSearch = (query: string) =>
  useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.trim().length > 1,
  })

export const useScenarios = () => useQuery({ queryKey: ['scenarios'], queryFn: api.scenarios })

export const useActions = () => useQuery({ queryKey: ['actions'], queryFn: api.actions })

function useInvalidating<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export const useInject = () => useInvalidating((scenarioId: string) => api.inject(scenarioId))

export const useRestore = () => useInvalidating(() => api.restore())

export const useApprove = () =>
  useInvalidating((vars: { incidentId: number; planId: number; approver: string }) =>
    api.approve(vars.incidentId, vars.planId, vars.approver),
  )

export const useReject = () =>
  useInvalidating(
    (vars: { incidentId: number; planId: number; approver: string; reason: string }) =>
      api.reject(vars.incidentId, vars.planId, vars.approver, vars.reason),
  )
