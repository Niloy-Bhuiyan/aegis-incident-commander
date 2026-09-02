import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { MetricPoint } from '../api/types'
import { fmtTime } from './ui'

type Props = {
  data: MetricPoint[]
  metric: 'latency_p95_ms' | 'error_rate' | 'saturation'
  slo?: number
  height?: number
}

const LABELS = {
  latency_p95_ms: 'p95 latency (ms)',
  error_rate: 'error rate',
  saturation: 'saturation',
} as const

export function MetricChart({ data, metric, slo, height = 190 }: Props) {
  const points = data.map((p) => ({
    ts: fmtTime(p.ts),
    value: metric === 'error_rate' ? p.error_rate * 100 : p[metric],
  }))
  const threshold = slo !== undefined && metric === 'error_rate' ? slo * 100 : slo

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#1f2f4d" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="ts"
          tick={{ fill: '#7f92b4', fontSize: 10 }}
          stroke="#1f2f4d"
          minTickGap={40}
        />
        <YAxis tick={{ fill: '#7f92b4', fontSize: 10 }} stroke="#1f2f4d" width={52} />
        <Tooltip
          contentStyle={{
            background: '#0b111f',
            border: '1px solid #1f2f4d',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: '#a6b6d3' }}
          formatter={(value) => {
            const numeric = Number(value)
            return [
              metric === 'error_rate' ? `${numeric.toFixed(2)}%` : numeric.toFixed(2),
              LABELS[metric],
            ]
          }}
        />
        {threshold !== undefined && (
          <ReferenceLine
            y={threshold}
            stroke="#f87171"
            strokeDasharray="4 4"
            label={{ value: 'SLO', fill: '#f87171', fontSize: 10, position: 'insideTopRight' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke="#38bdf8"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
