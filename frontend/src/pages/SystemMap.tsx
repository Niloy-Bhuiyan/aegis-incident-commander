import { Background, Controls, type Edge, type Node, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'

import { MetricChart } from '../components/MetricChart'
import { Card, Empty, Pill, fmtMs, fmtPct } from '../components/ui'
import { useServiceMetrics, useSystemStatus, useTopology } from '../hooks/queries'

const TIER_ROW: Record<string, number> = { edge: 0, application: 1, datastore: 2 }

const STATUS_BORDER: Record<string, string> = {
  healthy: '#34d399',
  degraded: '#f87171',
  unknown: '#2c4066',
}

export function SystemMap() {
  const { data: topology } = useTopology()
  const { data: status } = useSystemStatus()
  const [selected, setSelected] = useState<string>('gateway')
  const { data: metrics } = useServiceMetrics(selected)

  const { nodes, edges } = useMemo(() => {
    if (!topology) return { nodes: [] as Node[], edges: [] as Edge[] }

    const rows: Record<number, string[]> = {}
    topology.nodes.forEach((node) => {
      const row = TIER_ROW[node.tier] ?? 1
      rows[row] = [...(rows[row] ?? []), node.id]
    })

    const nodes: Node[] = topology.nodes.map((node) => {
      const row = TIER_ROW[node.tier] ?? 1
      const column = rows[row].indexOf(node.id)
      const width = rows[row].length
      return {
        id: node.id,
        position: { x: 130 + column * 260 - (width - 1) * 60, y: 40 + row * 150 },
        data: {
          label: (
            <div className="px-1 py-0.5 text-left">
              <div className="text-[13px] font-medium text-mist-100">{node.id}</div>
              <div className="mt-0.5 font-mono text-[10px] text-mist-400">
                {fmtMs(node.latency_p95_ms)} · {fmtPct(node.error_rate)}
              </div>
            </div>
          ),
        },
        style: {
          background: node.status === 'degraded' ? 'rgba(248,113,113,0.12)' : '#101a2c',
          border: `1.5px solid ${STATUS_BORDER[node.status] ?? '#2c4066'}`,
          borderRadius: 10,
          color: '#dce5f5',
          width: 190,
          padding: 8,
          fontSize: 12,
        },
      }
    })

    const edges: Edge[] = topology.edges.map((edge) => {
      const target = topology.nodes.find((n) => n.id === edge.target)
      const degraded = target?.status === 'degraded'
      return {
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        animated: degraded,
        style: { stroke: degraded ? '#f87171' : '#2c4066', strokeWidth: degraded ? 2 : 1.5 },
      }
    })

    return { nodes, edges }
  }, [topology])

  const service = status?.services.find((s) => s.name === selected)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">System Map</h1>
        <p className="mt-1 text-sm text-mist-400">
          Service dependencies, live health, and the propagation paths Aegis uses to pick an origin
          service. Edges point from a service to what it depends on.
        </p>
      </header>

      <Card className="overflow-hidden" title="Dependency graph" subtitle="Click a service for detail">
        <div style={{ height: 520 }} data-testid="system-map">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelected(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
          >
            <Background color="#1f2f4d" gap={22} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <Card
          title={selected}
          subtitle={service?.description}
          actions={service ? <Pill value={service.status} /> : undefined}
        >
          {service ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-ink-800 bg-ink-900/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-mist-400">p95 / SLO</div>
                  <div className="mt-0.5 font-mono text-mist-100">
                    {fmtMs(service.latency_p95_ms)} / {fmtMs(service.slo_latency_p95_ms)}
                  </div>
                </div>
                <div className="rounded border border-ink-800 bg-ink-900/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-mist-400">
                    errors / SLO
                  </div>
                  <div className="mt-0.5 font-mono text-mist-100">
                    {fmtPct(service.error_rate)} / {fmtPct(service.slo_error_rate)}
                  </div>
                </div>
              </div>
              <p className="text-mist-300">
                Depends on:{' '}
                <span className="font-mono text-mist-100">
                  {service.depends_on.join(', ') || 'nothing'}
                </span>
              </p>
              {service.breaches.length > 0 && (
                <ul className="space-y-1">
                  {service.breaches.map((breach) => (
                    <li key={breach} className="text-alarm-500">
                      {breach}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <Empty>Select a service.</Empty>
          )}
        </Card>

        <Card title="p95 latency" subtitle={selected}>
          {metrics?.length ? (
            <MetricChart
              data={metrics}
              metric="latency_p95_ms"
              slo={service?.slo_latency_p95_ms}
            />
          ) : (
            <Empty>No telemetry.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
