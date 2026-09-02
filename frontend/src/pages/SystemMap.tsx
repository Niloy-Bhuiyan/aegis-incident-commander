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
        position: { x: 140 + column * 230 - ((width - 1) * 230) / 2, y: 24 + row * 128 },
        data: {
          label: (
            <div className="w-full text-left leading-tight">
              <div className="flex items-baseline gap-1.5">
                <span
                  aria-hidden
                  style={{ color: degraded ? 'var(--color-alarm)' : 'var(--color-ok)' }}
                  className="text-[7px]"
                >
                  {degraded ? '■' : '●'}
                </span>
                <span className="text-[12.5px] text-ink">{node.id}</span>
              </div>
              <div className="tnum mt-1 text-[10.5px] text-ink-3">
                {fmtMs(node.latency_p95_ms)} · {fmtPct(node.error_rate, 1)}
              </div>
            </div>
          ),
        },
        style: {
          background: degraded ? 'var(--color-alarm-bg)' : 'var(--color-page)',
          border: `1px solid ${isSelected ? 'var(--color-ink)' : 'var(--color-line-strong)'}`,
          borderRadius: 6,
          boxShadow: 'none',
          width: 168,
          padding: '9px 11px',
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
          strokeWidth: degraded ? 1.6 : 1.2,
        },
      }
    })

    return { nodes, edges }
  }, [topology, selected])

  const service = status?.services.find((s) => s.name === selected)

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-[21px] leading-tight font-semibold tracking-tight text-ink">
          System Map
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          Each arrow points from a service to something it depends on. This is how Aegis separates
          cause from consequence: when several services alarm at once, the real origin is the one
          that is failing without any of its own dependencies failing.
        </p>
      </header>

      <Card title="Dependency graph" hint="click a service for detail" bodyClass="p-0">
        <div style={{ height: 430 }} data-testid="system-map">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            onNodeClick={(_, node) => setSelected(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
          >
            <Background color="var(--color-line-strong)" gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
        <Card
          bare
          title={selected}
          hint={service?.tier}
          actions={service ? <Badge value={service.status} /> : null}
        >
          {service ? (
            <div className="space-y-4 border-t border-line pt-4">
              <p className="text-[12.5px] leading-relaxed text-ink-2">{service.description}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Field label="Latency p95">
                  {fmtMs(service.latency_p95_ms)} / {fmtMs(service.slo_latency_p95_ms)}
                </Field>
                <Field label="Errors">
                  {fmtPct(service.error_rate)} / {fmtPct(service.slo_error_rate, 1)}
                </Field>
                <Field label="Saturation">{fmtNum(service.saturation)}</Field>
                <Field label="Requests/s">{service.rps?.toFixed(0) ?? '—'}</Field>
              </div>
              <Field label="Depends on">{service.depends_on.join(', ') || 'nothing'}</Field>
              {service.breaches.map((breach) => (
                <p key={breach} className="text-[12.5px] text-alarm">
                  {breach}
                </p>
              ))}
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
              height={170}
            />
          ) : (
            <Empty>No telemetry.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
