import { Background, Controls, type Edge, type Node, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'

import { MetricChart } from '../components/MetricChart'
import { Badge, Card, Empty, Field, fmtMs, fmtNum, fmtPct } from '../components/ui'
import { useServiceMetrics, useSystemStatus, useTopology } from '../hooks/queries'

const TIER_ROW: Record<string, number> = { edge: 0, application: 1, datastore: 2 }

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
      const isSelected = node.id === selected
      return {
        id: node.id,
        position: { x: 150 + column * 250 - ((width - 1) * 250) / 2, y: 30 + row * 140 },
        data: {
          label: (
            <div className="w-full text-left leading-tight">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  style={{ color: degraded ? 'var(--color-alarm)' : 'var(--color-ok)' }}
                  className="text-[8px]"
                >
                  {degraded ? '■' : '●'}
                </span>
                <span className="text-[13px] font-semibold text-ink">{node.id}</span>
              </div>
              <div className="tnum mt-1 text-[10.5px] text-ink-3">
                {fmtMs(node.latency_p95_ms)} · {fmtPct(node.error_rate, 1)}
              </div>
            </div>
          ),
        },
        style: {
          background: degraded ? 'var(--color-alarm-bg)' : 'var(--color-card)',
          border: `1.5px solid ${
            degraded
              ? 'var(--color-alarm-line)'
              : isSelected
                ? 'var(--color-info)'
                : 'var(--color-line-strong)'
          }`,
          borderRadius: 12,
          boxShadow: '0 1px 2px rgb(28 25 23 / 0.04), 0 2px 6px rgb(28 25 23 / 0.05)',
          width: 178,
          padding: '10px 12px',
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
          strokeWidth: degraded ? 2 : 1.4,
        },
      }
    })

    return { nodes, edges }
  }, [topology, selected])

  const service = status?.services.find((s) => s.name === selected)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">System Map</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-3">
          Edges point from a service to what it depends on. The origin of an incident is the
          breaching service with no breaching dependency — everything downstream of it is explained
          by propagation.
        </p>
      </header>

      <Card title="Dependency graph" hint="select a service for detail" bodyClass="p-0">
        <div style={{ height: 470 }} data-testid="system-map" className="rounded-b-lg">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelected(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
          >
            <Background color="var(--color-line-strong)" gap={22} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title={selected}
          hint={service?.tier}
          actions={service ? <Badge value={service.status} /> : null}
        >
          {service ? (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-ink-2">{service.description}</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Field label="p95 / SLO">
                  {fmtMs(service.latency_p95_ms)} / {fmtMs(service.slo_latency_p95_ms)}
                </Field>
                <Field label="errors / SLO">
                  {fmtPct(service.error_rate)} / {fmtPct(service.slo_error_rate, 1)}
                </Field>
                <Field label="saturation">{fmtNum(service.saturation)}</Field>
                <Field label="req/s">{service.rps?.toFixed(0) ?? '—'}</Field>
              </div>
              <Field label="depends on">{service.depends_on.join(', ') || 'nothing'}</Field>
              {service.breaches.length > 0 && (
                <ul className="space-y-1.5">
                  {service.breaches.map((breach) => (
                    <li
                      key={breach}
                      className="flex gap-2 rounded-md bg-alarm-bg px-3 py-2 text-[12.5px] text-alarm"
                    >
                      <span aria-hidden className="mt-[5px] text-[7px]">
                        ■
                      </span>
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

        <Card title="p95 latency" hint={selected}>
          {metrics?.length ? (
            <MetricChart
              data={metrics}
              metric="latency_p95_ms"
              slo={service?.slo_latency_p95_ms}
              height={190}
            />
          ) : (
            <Empty>No telemetry.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
