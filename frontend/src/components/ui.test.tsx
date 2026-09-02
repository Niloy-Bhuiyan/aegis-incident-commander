import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge, Field, Metric, StatusDot, fmtAgo, fmtMs, fmtNum, fmtPct, toneFor } from './ui'

describe('formatters', () => {
  it('formats milliseconds, switching to seconds past 1000', () => {
    expect(fmtMs(1092.4)).toBe('1.09s')
    expect(fmtMs(214)).toBe('214ms')
    expect(fmtMs(null)).toBe('—')
    expect(fmtMs(undefined)).toBe('—')
  })

  it('formats rates as percentages', () => {
    expect(fmtPct(0.211)).toBe('21.10%')
    expect(fmtPct(0.0005)).toBe('0.05%')
    expect(fmtPct(0.02, 1)).toBe('2.0%')
    expect(fmtPct(null)).toBe('—')
  })

  it('formats plain numbers', () => {
    expect(fmtNum(0.9712)).toBe('0.97')
    expect(fmtNum(null)).toBe('—')
  })

  it('formats relative ages', () => {
    const now = Date.now()
    expect(fmtAgo(new Date(now - 5_000).toISOString())).toMatch(/^\d+s ago$/)
    expect(fmtAgo(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago')
    expect(fmtAgo(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago')
  })
})

describe('toneFor', () => {
  it('maps domain states onto the signal palette', () => {
    expect(toneFor('healthy')).toBe('ok')
    expect(toneFor('resolved')).toBe('ok')
    expect(toneFor('degraded')).toBe('alarm')
    expect(toneFor('SEV1')).toBe('alarm')
    expect(toneFor('contradicted')).toBe('alarm')
    expect(toneFor('awaiting_approval')).toBe('warn')
    expect(toneFor('dry_run')).toBe('warn')
    expect(toneFor('verifying')).toBe('info')
    expect(toneFor('anything-else')).toBe('neutral')
  })
})

describe('Badge', () => {
  it('renders the value with underscores replaced', () => {
    render(<Badge value="awaiting_approval" />)
    expect(screen.getByText(/awaiting approval/)).toBeInTheDocument()
  })

  it('prefers an explicit label', () => {
    render(<Badge value="degraded" label="active" />)
    expect(screen.getByText(/active/)).toBeInTheDocument()
  })

  it('carries a glyph so state is not conveyed by colour alone', () => {
    const { container } = render(<Badge value="degraded" />)
    expect(container.textContent).toMatch(/[■▲●◆○]/)
  })
})

describe('StatusDot', () => {
  it('uses a distinct glyph per tone', () => {
    const ok = render(<StatusDot value="healthy" />).container.textContent
    const alarm = render(<StatusDot value="degraded" />).container.textContent
    expect(ok).not.toBe(alarm)
  })
})

describe('Metric', () => {
  it('shows the value, unit and threshold', () => {
    render(<Metric value="870ms" unit="p95" threshold="400ms" breached />)
    expect(screen.getByText('870ms')).toBeInTheDocument()
    expect(screen.getByText('p95')).toBeInTheDocument()
    expect(screen.getByText('/ 400ms')).toBeInTheDocument()
  })

  it('marks a breached value', () => {
    const { container } = render(<Metric value="870ms" breached />)
    expect(container.querySelector('.text-alarm')).not.toBeNull()
  })
})

describe('Field', () => {
  it('renders a labelled value', () => {
    render(<Field label="max_connections">300</Field>)
    expect(screen.getByText('max_connections')).toBeInTheDocument()
    expect(screen.getByText('300')).toBeInTheDocument()
  })
})
