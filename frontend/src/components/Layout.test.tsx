import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import { renderWithProviders, statusFixture } from '../test/harness'
import { Layout } from './Layout'

vi.mock('../api/client', () => ({
  api: { systemStatus: vi.fn(), incidents: vi.fn() },
  ApiError: class extends Error {},
}))

const mocked = vi.mocked(api)

describe('Layout status strip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.systemStatus.mockResolvedValue(statusFixture)
    mocked.incidents.mockResolvedValue([])
  })

  it('reports the platform as degraded when a service breaches', async () => {
    renderWithProviders(<Layout />)
    await waitFor(() =>
      expect(screen.getByTestId('platform-status')).toHaveTextContent(/degraded/i),
    )
  })

  it('reports the platform as healthy when everything is inside SLO', async () => {
    mocked.systemStatus.mockResolvedValue({ ...statusFixture, healthy: true })
    renderWithProviders(<Layout />)
    await waitFor(() =>
      expect(screen.getByTestId('platform-status')).toHaveTextContent(/healthy/i),
    )
  })

  it('names the telemetry source and the reasoning model', async () => {
    renderWithProviders(<Layout />)
    expect(await screen.findByText('simulated')).toBeInTheDocument()
    expect(screen.getByText('rules/v1')).toBeInTheDocument()
  })

  it('flags a read-only telemetry source', async () => {
    mocked.systemStatus.mockResolvedValue({
      ...statusFixture,
      telemetry: { ...statusFixture.telemetry, source: 'prometheus', supports_remediation: false },
    })
    renderWithProviders(<Layout />)
    expect(await screen.findByText(/read only/i)).toBeInTheDocument()
  })

  it('counts open incidents, ignoring resolved ones', async () => {
    mocked.incidents.mockResolvedValue([
      { ...base(), id: 1, status: 'awaiting_approval' },
      { ...base(), id: 2, status: 'resolved' },
      { ...base(), id: 3, status: 'cancelled' },
    ])
    renderWithProviders(<Layout />)
    expect(await screen.findByText(/1 open incident/)).toBeInTheDocument()
  })

  it('opens the shortcut sheet with ? and closes it with Escape', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Layout />)

    await user.keyboard('?')
    expect(await screen.findByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('exposes primary navigation with accessible names', async () => {
    renderWithProviders(<Layout />)
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Command Center/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /Demo Lab/ })).toHaveAttribute('href', '/lab')
  })
})

function base() {
  return {
    id: 1,
    title: 'x',
    service: 'gateway',
    severity: 'SEV2',
    status: 'open',
    workflow_state: 'detected',
    detector: 'slo_breach_rule/v1',
    summary: '',
    root_cause: '',
    opened_at: new Date().toISOString(),
    resolved_at: null,
    scenario: '',
  }
}
