/**
 * Inline trend for a table row. Deliberately unlabelled and non-interactive -
 * it answers "is this moving?" at a glance; the chart panel answers "by how
 * much?". A screen reader gets the summary instead of the path.
 */
export function Sparkline({
  values,
  threshold,
  width = 76,
  height = 20,
  label,
}: {
  values: number[]
  threshold?: number
  width?: number
  height?: number
  label?: string
}) {
  if (values.length < 2) {
    return <span className="inline-block text-[10px] text-fg-3" style={{ width }} />
  }

  const series = values.slice(-40)
  const lo = Math.min(...series, threshold ?? Infinity)
  const hi = Math.max(...series, threshold ?? -Infinity)
  const span = hi - lo || 1
  const pad = 2
  const usable = height - pad * 2

  const x = (i: number) => (i / (series.length - 1)) * width
  const y = (v: number) => pad + usable - ((v - lo) / span) * usable

  const path = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${path} L${width},${height} L0,${height} Z`

  const last = series[series.length - 1]
  const breached = threshold !== undefined && last > threshold
  const stroke = breached ? 'var(--color-alarm)' : 'var(--color-info)'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? 'trend'}
      className="overflow-visible align-middle"
    >
      <path d={area} fill={stroke} opacity={0.1} />
      {threshold !== undefined && threshold >= lo && threshold <= hi && (
        <line
          x1={0}
          x2={width}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--color-alarm)"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.5}
        />
      )}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.4} />
      <circle cx={x(series.length - 1)} cy={y(last)} r={1.8} fill={stroke} />
    </svg>
  )
}
