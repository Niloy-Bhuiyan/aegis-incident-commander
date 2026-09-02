/**
 * Inline trend for a table row. It answers "is this moving?" at a glance; the
 * chart panel answers "by how much?". Screen readers get the label, not the path.
 */
export function Sparkline({
  values,
  threshold,
  width = 92,
  height = 26,
  label,
}: {
  values: number[]
  threshold?: number
  width?: number
  height?: number
  label?: string
}) {
  if (values.length < 2) {
    return <span className="inline-block" style={{ width, height }} />
  }

  const series = values.slice(-40)
  // Scale to the data, not to the threshold. A far-away SLO line would
  // otherwise dominate the range and flatten the trend into a straight line -
  // which is the one thing a sparkline exists to show.
  const dataLo = Math.min(...series)
  const dataHi = Math.max(...series)
  const headroom = (dataHi - dataLo || dataHi || 1) * 0.15
  const lo = dataLo - headroom
  const hi = dataHi + headroom
  const span = hi - lo || 1
  const pad = 3
  const usable = height - pad * 2

  const x = (i: number) => (i / (series.length - 1)) * width
  const y = (v: number) => pad + usable - ((v - lo) / span) * usable

  const path = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${path} L${width},${height} L0,${height} Z`

  const last = series[series.length - 1]
  const breached = threshold !== undefined && last > threshold
  const stroke = breached ? 'var(--color-alarm)' : 'var(--color-info)'
  const gradientId = `spark-${breached ? 'alarm' : 'info'}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? 'trend'}
      className="align-middle"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      {threshold !== undefined && threshold >= lo && threshold <= hi && (
        <line
          x1={0}
          x2={width}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--color-alarm)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.4}
        />
      )}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" />
      <circle cx={x(series.length - 1)} cy={y(last)} r={2.4} fill={stroke} />
      <circle cx={x(series.length - 1)} cy={y(last)} r={4.5} fill={stroke} opacity={0.18} />
    </svg>
  )
}
