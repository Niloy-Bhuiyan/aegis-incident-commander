import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import { renderWithProviders, statusFixture } from '../test/harness'
import { DemoLab } from './DemoLab'

vi.mock('../api/client', () => ({
  api: {
    scenarios: vi.fn(),
    systemStatus: vi.fn(),
    actions: vi.fn(),
    incidents: vi.fn(),
    inject: vi.fn(),
    restore: vi.fn(),
  },
  ApiError: class extends Error {},
}))

const mocked = vi.mocked(api)

describe('DemoLab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.scenarios.mockResolvedValue([
      {
        id: 'checkout_latency_regression',
        title: 'Checkout latency regression',
        description: 'checkout-service p95 climbs after a release.',
        primary_service: 'checkout-service',
      },
      {
        id: 'auth_error_spike',
        title: 'Authentication 5xx spike',
        description: 'auth-service returns HTTP 500 after a config change.',
        primary_service: 'auth-service',
      },
    ])
    mocked.systemStatus.mockResolvedValue({
      ...statusFixture,
      telemetry: { ...statusFixture.telemetry, active_scenarios: [] },
    })
    mocked.actions.mockResolvedValue([
      {
        id: 'rollback_deployment',
        title: 'Roll back deployment',
        description: 'Revert a service to its previous artifact.',
        risk: 'medium',
        rollback: 'Redeploy later.',
        params: [
          {
            name: 'service',
            kind: 'service',
            required: true,
            minimum: null,
            maximum: null,
            choices: null,
            description: '',
          },
        ],
      },
    ])
    mocked.incidents.mockResolvedValue([])
    mocked.inject.mockResolvedValue({})
    mocked.restore.mockResolvedValue({})
  })

  it('lists the injectable scenarios', async () => {
    renderWithProviders(<DemoLab />)
    expect(await screen.findByText('Checkout latency regression')).toBeInTheDocument()
    expect(await screen.findByText('Authentication 5xx spike')).toBeInTheDocument()
  })

  it('injects the chosen failure', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DemoLab />)
    const buttons = await screen.findAllByRole('button', { name: /inject failure/i })

    await user.click(buttons[0])
    await waitFor(() =>
      expect(mocked.inject).toHaveBeenCalledWith('checkout_latency_regression'),
    )
  })

  it('restores the platform', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DemoLab />)
    await user.click(await screen.findByRole('button', { name: /restore system/i }))
    await waitFor(() => expect(mocked.restore).toHaveBeenCalled())
  })

  it('shows the remediation allowlist', async () => {
    renderWithProviders(<DemoLab />)
    expect(await screen.findByText('rollback_deployment')).toBeInTheDocument()
  })
})
