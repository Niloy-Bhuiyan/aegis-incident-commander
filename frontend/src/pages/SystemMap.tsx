import { Background, Controls, type Edge, type Node, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'

import { MetricChart } from '../components/MetricChart'
import { Badge, Empty, Field, Panel, fmtMs, fmtNum, fmtPct } from '../components/ui'
import { useServiceMetrics, useSystemStatus, useTopology } from '../hooks/queries'

const TIER_ROW: Record<string, number> = { edge: 0, application: 1, datastore: 2 }

const BORDER: Record<string, string> = {
  healthy: 'var(--color-line-strong)',
  degraded: 'var(--color-alarm)',
  unknown: 'var(--color-line)',
}

export function SystemMap() {
  const { data: topology } = useTopology()
  const { data: status } = useSystemStatus()
  const [selected, setSelected] = useState('gateway')
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
      const degraded = node.status === 'degraded'
      return {
        id: node.id,
        position: { x: 140 + column * 240 - ((width - 1) * 240) / 2, y: 30 + row * 130 },
        data: {
          label: (
            <div className="w-full text-left leading-tight">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  style={{ color: degraded ? 'var(--color-alarm)' : 'var(--color-ok)' }}
                  className="text-[8px]"
                >
                  {degraded ? '■' : '●'}
                </span>
                <span className="text-[12px] font-medium text-fg">{node.id}</span>
              </div>
              <div className="tnum mt-0.5 text-[9.5px] text-fg-3">
                {fmtMs(node.latency_p95_ms)} · {fmtPct(node.error_rate, 1)}
              </div>
            </div>
          ),
        },
        style: {
          background: degraded ? 'var(--color-alarm-dim)' : 'var(--color-raised)',
          border: `1px solid ${BORDER[node.status] ?? 'var(--color-line)'}`,
          borderRadius: 4,
          width: 168,
          padding: '6px 8px',
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
        style: {
          stroke: degraded ? 'var(--color-alarm)' : 'var(--color-line-strong)',
          strokeWidth: degraded ? 1.8 : 1.2,
        },
      }
    })

    return { nodes, edges }
  }, [topology])

  const service = status?.services.find((s) => s.name === selected)

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">System Map</h1>
        <p className="text-[11px] text-fg-3">
          Edges point from a service to what it depends on. The origin of an incident is the
          breaching service with no breaching dependency.
        </p>
      </div>

      <Panel title="Dependency graph" hint="click a service" bodyClass="p-0">
        <div style={{ height: 460 }} data-testid="system-map">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelected(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
          >
            <Background color="var(--color-line)" gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title={selected}
          hint={service?.tier}
          actions={service ? <Badge value={service.status} /> : null}
        >
          {service ? (
            <div className="space-y-2">
              <p className="text-[11px] leading-snug text-fg-2">{service.description}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Field label="p95 / SLO">
                  {fmtMs(service.latency_p95_ms)} / {fmtMs(service.slo_latency_p95_ms)}
                </Field>
                <Field label="errors / SLO">
                  {fmtPct(service.error_rate)} / {fmtPct(service.slo_error_rate, 1)}
                </Field>
                <Field label="saturation">{fmtNum(service.saturation)}</Field>
                <Field label="rps">{service.rps?.toFixed(0) ?? '—'}</Field>
              </div>
              <Field label="depends on">
                {service.depends_on.join(', ') || 'nothing'}
              </Field>
              {service.breaches.length > 0 && (
                <ul className="space-y-0.5">
                  {service.breaches.map((breach) => (
                    <li key={breach} className="flex gap-1.5 text-[11px] text-alarm">
                      <span aria-hidden>■</span>
                      {breach}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <Empty>Select a service.</Empty>
          )}
        </Panel>

        <Panel title="p95 latency" hint={selected}>
          {metrics?.length ? (
            <MetricChart
              data={metrics}
              metric="latency_p95_ms"
              slo={service?.slo_latency_p95_ms}
              height={150}
            />
          ) : (
            <Empty>No telemetry.</Empty>
          )}
        </Panel>
      </div>
    </div>
  )
}
