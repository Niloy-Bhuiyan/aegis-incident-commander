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
  height = 150,
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
        <defs>
          <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 3" vertical={false} />
        <XAxis
          dataKey="ts"
          tick={{ fill: 'var(--color-fg-3)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
          stroke="var(--color-line)"
          tickLine={false}
          minTickGap={44}
        />
        <YAxis
          tick={{ fill: 'var(--color-fg-3)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
          stroke="var(--color-line)"
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-line-strong)', strokeWidth: 1 }}
          contentStyle={{
            background: 'var(--color-raised)',
            border: '1px solid var(--color-line-strong)',
            borderRadius: 4,
            fontSize: 11,
            padding: '4px 8px',
          }}
          labelStyle={{ color: 'var(--color-fg-3)', fontSize: 10 }}
          itemStyle={{ color: 'var(--color-fg)' }}
          formatter={(value) => [
            `${Number(value).toFixed(metric === 'saturation' ? 2 : 1)}${UNITS[metric]}`,
            LABELS[metric],
          ]}
        />
        {threshold !== undefined && (
          <ReferenceLine
            y={threshold}
            stroke="var(--color-alarm)"
            strokeDasharray="3 3"
            strokeOpacity={0.7}
            label={{
              value: `SLO ${threshold}${UNITS[metric]}`,
              fill: 'var(--color-alarm)',
              fontSize: 9,
              position: 'insideTopRight',
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={1.6}
          fill={`url(#fill-${metric})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
