import { screen, within } from '@testing-library/react'
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
    allServiceMetrics: vi.fn(),
  },
  ApiError: class extends Error {},
}))

const mocked = vi.mocked(api)

const OPEN_INCIDENT = {
  id: 7,
  title: 'checkout-service: latency SLO breach',
  service: 'checkout-service',
  severity: 'SEV2',
  status: 'awaiting_approval',
  workflow_state: 'awaiting_approval',
  detector: 'slo_breach_rule/v1',
  summary: '',
  root_cause: '',
  opened_at: new Date().toISOString(),
  resolved_at: null,
  scenario: '',
}

describe('CommandCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.systemStatus.mockResolvedValue(statusFixture)
    mocked.incidents.mockResolvedValue([OPEN_INCIDENT])
    mocked.changes.mockResolvedValue([])
    mocked.serviceMetrics.mockResolvedValue([])
    mocked.allServiceMetrics.mockResolvedValue({})
  })

  it('shows every service with its latency and error SLO', async () => {
    renderWithProviders(<CommandCenter />)
    const row = await screen.findByTestId('service-gateway')

    expect(within(row).getByText('gateway')).toBeInTheDocument()
    expect(within(row).getByText('870ms')).toBeInTheDocument()
    expect(within(row).getByText('/ 400ms')).toBeInTheDocument()
    expect(screen.getByTestId('service-checkout-service')).toBeInTheDocument()
    expect(screen.getByTestId('service-payments-db')).toBeInTheDocument()
  })

  it('marks a breaching service as degraded and a healthy one as healthy', async () => {
    renderWithProviders(<CommandCenter />)
    const gateway = await screen.findByTestId('service-gateway')
    const db = screen.getByTestId('service-payments-db')

    expect(within(gateway).getByText(/degraded/)).toBeInTheDocument()
    expect(within(db).getByText(/healthy/)).toBeInTheDocument()
  })

  it('summarises how many services are outside SLO', async () => {
    renderWithProviders(<CommandCenter />)
    expect(await screen.findByText('2 of 3 services outside SLO')).toBeInTheDocument()
  })

  it('surfaces the open incident as a link to its investigation', async () => {
    renderWithProviders(<CommandCenter />)
    const links = await screen.findAllByRole('link', {
      name: /checkout-service: latency SLO breach/i,
    })
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => expect(link).toHaveAttribute('href', '/incidents/7'))
  })

  it('lists incidents in the incident panel', async () => {
    renderWithProviders(<CommandCenter />)
    const list = await screen.findByTestId('incident-list')
    expect(within(list).getByText(/checkout-service: latency SLO breach/)).toBeInTheDocument()
    expect(within(list).getByText(/#7 · checkout-service/)).toBeInTheDocument()
  })

  it('invites the user to the Demo Lab when there are no incidents', async () => {
    mocked.incidents.mockResolvedValue([])
    renderWithProviders(<CommandCenter />)
    expect(await screen.findByText(/Inject a failure from the Demo Lab/i)).toBeInTheDocument()
  })
})
