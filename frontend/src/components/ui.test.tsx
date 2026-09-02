import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Pill, Stat, fmtMs, fmtPct } from './ui'

describe('formatters', () => {
  it('formats milliseconds and handles missing values', () => {
    expect(fmtMs(1092.4)).toBe('1092ms')
    expect(fmtMs(null)).toBe('--')
    expect(fmtMs(undefined)).toBe('--')
  })

  it('formats rates as percentages', () => {
    expect(fmtPct(0.211)).toBe('21.10%')
    expect(fmtPct(0.0005)).toBe('0.05%')
    expect(fmtPct(null)).toBe('--')
  })
})

describe('Pill', () => {
  it('renders the value with underscores replaced', () => {
    render(<Pill value="awaiting_approval" />)
    expect(screen.getByText('awaiting approval')).toBeInTheDocument()
  })

  it('prefers an explicit label', () => {
    render(<Pill value="degraded" label="active" />)
    expect(screen.getByText('active')).toBeInTheDocument()
  })
})

describe('Stat', () => {
  it('renders label, value and hint', () => {
    render(<Stat label="Gateway p95" value="870ms" hint="SLO 400ms" tone="alarm" />)
    expect(screen.getByText('Gateway p95')).toBeInTheDocument()
    expect(screen.getByText('870ms')).toBeInTheDocument()
    expect(screen.getByText('SLO 400ms')).toBeInTheDocument()
  })
})
