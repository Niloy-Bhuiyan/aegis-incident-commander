import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import { renderWithProviders, statusFixture } from '../test/harness'
import { CommandCenter } from './CommandCenter'

vi.mock('../api/client', () => ({
  api: {
    systemStatus: vi.fn(),
    incidents: vi.fn(),
    changes: vi.fn(),
    serviceMetrics: vi.fn(),
  },
  ApiError: class extends Error {},
}))

const mocked = vi.mocked(api)

describe('CommandCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.systemStatus.mockResolvedValue(statusFixture)
    mocked.incidents.mockResolvedValue([
      {
        id: 7,
        title: 'checkout-service: latency SLO breach',
        service: 'checkout-service',
        severity: 'SEV2',
        status: 'awaiting_approval',
        workflow_state: 'awaiting_approval',
        detector: 'slo_breach_rule/v1',
        summary: '',
        root_cause: '',
        opened_at: '2026-09-02T10:00:00Z',
        resolved_at: null,
        scenario: '',
      },
    ])
    mocked.changes.mockResolvedValue([])
    mocked.serviceMetrics.mockResolvedValue([])
  })

  it('shows every service with its SLO', async () => {
    renderWithProviders(<CommandCenter />)
    await waitFor(() => expect(screen.getByTestId('service-gateway')).toBeInTheDocument())
    expect(screen.getByTestId('service-checkout-service')).toBeInTheDocument()
    expect(screen.getByTestId('service-payments-db')).toBeInTheDocument()
  })

  it('reports the platform as degraded when a service breaches', async () => {
    renderWithProviders(<CommandCenter />)
    await waitFor(() =>
      expect(screen.getByTestId('platform-status')).toHaveTextContent('degraded'),
    )
  })

  it('lists the open incident and links to its investigation', async () => {
    renderWithProviders(<CommandCenter />)
    const link = await screen.findByRole('link', {
      name: /checkout-service: latency SLO breach/i,
    })
    expect(link).toHaveAttribute('href', '/incidents/7')
  })

  it('counts active incidents', async () => {
    renderWithProviders(<CommandCenter />)
    await waitFor(() => expect(screen.getByText('Active incidents')).toBeInTheDocument())
    expect(screen.getByText('nothing open')).toBeNull
  })
})
