import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { MetricPoint } from '../api/types'
import { fmtTime } from './ui'

type Metric = 'latency_p95_ms' | 'latency_p50_ms' | 'error_rate' | 'saturation' | 'rps'

const LABELS: Record<Metric, string> = {
  latency_p95_ms: 'p95 latency',
  latency_p50_ms: 'p50 latency',
  error_rate: 'error rate',
  saturation: 'saturation',
  rps: 'requests/s',
}

const UNITS: Record<Metric, string> = {
  latency_p95_ms: 'ms',
  latency_p50_ms: 'ms',
  error_rate: '%',
  saturation: '',
  rps: '/s',
}

export function MetricChart({
  data,
  metric,
  slo,
  height = 180,
}: {
  data: MetricPoint[]
  metric: Metric
  slo?: number
  height?: number
}) {
  const scale = metric === 'error_rate' ? 100 : 1
  const points = data.map((p) => ({ ts: fmtTime(p.ts), value: p[metric] * scale }))
  const threshold = slo === undefined ? undefined : slo * scale
  const last = points.at(-1)?.value ?? 0
  const breached = threshold !== undefined && last > threshold
  const stroke = breached ? 'var(--color-alarm)' : 'var(--color-info)'
  const tickStyle = {
    fill: 'var(--color-ink-3)',
    fontSize: 11,
    fontFamily: 'JetBrains Mono',
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-line)" vertical={false} />
        <XAxis
          dataKey="ts"
          tick={tickStyle}
          stroke="var(--color-line)"
          tickLine={false}
          axisLine={false}
          minTickGap={52}
          dy={4}
        />
        <YAxis
          tick={tickStyle}
          stroke="var(--color-line)"
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-line-strong)', strokeWidth: 1 }}
          contentStyle={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-line)',
            borderRadius: 10,
            boxShadow: '0 8px 20px rgb(28 25 23 / 0.08)',
            fontSize: 12,
            padding: '8px 12px',
          }}
          labelStyle={{ color: 'var(--color-ink-3)', fontSize: 11, marginBottom: 2 }}
          itemStyle={{ color: 'var(--color-ink)', fontWeight: 600 }}
          formatter={(value) => [
            `${Number(value).toFixed(metric === 'saturation' ? 2 : 1)}${UNITS[metric]}`,
            LABELS[metric],
          ]}
        />
        {threshold !== undefined && (
          <ReferenceLine
            y={threshold}
            stroke="var(--color-alarm)"
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            label={{
              value: `SLO ${threshold}${UNITS[metric]}`,
              fill: 'var(--color-alarm)',
              fontSize: 10,
              fontWeight: 600,
              position: 'insideTopRight',
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#fill-${metric})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
