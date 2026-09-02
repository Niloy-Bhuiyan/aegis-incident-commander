import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../api/client'
import { incidentFixture, renderRoute } from '../test/harness'
import { IncidentInvestigation } from './IncidentInvestigation'

vi.mock('../api/client', () => ({
  api: {
    incident: vi.fn(),
    serviceMetrics: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
  ApiError: class extends Error {},
}))

const mocked = vi.mocked(api)

const renderIncident = () =>
  renderRoute('/incidents/:id', <IncidentInvestigation />, '/incidents/7')

describe('IncidentInvestigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.incident.mockResolvedValue(incidentFixture)
    mocked.serviceMetrics.mockResolvedValue([])
    mocked.approve.mockResolvedValue({ resolved_fault: true })
    mocked.reject.mockResolvedValue({ status: 'rejected' })
  })

  it('renders the incident, its summary and the workflow track', async () => {
    renderIncident()
    await waitFor(() =>
      expect(screen.getByTestId('incident-title')).toHaveTextContent(
        'checkout-service: latency SLO breach',
      ),
    )
    expect(screen.getByTestId('incident-summary')).toHaveTextContent('5.1x baseline')
    expect(screen.getByTestId('workflow-track')).toHaveTextContent('awaiting approval')
  })

  it('ranks hypotheses and surfaces the critic verdict', async () => {
    renderIncident()
    await waitFor(() => expect(screen.getByTestId('hypothesis-1')).toBeInTheDocument())
    expect(screen.getByTestId('hypothesis-1')).toHaveTextContent('bad deploy')
    expect(screen.getByTestId('hypothesis-2')).toHaveTextContent('contradicted')
    expect(screen.getByTestId('hypothesis-2')).toHaveTextContent(/Unsupported:/)
  })

  it('renders every cited evidence reference', async () => {
    renderIncident()
    await waitFor(() => expect(screen.getByTestId('evidence-E1')).toBeInTheDocument())
    expect(screen.getByTestId('evidence-K1')).toHaveTextContent('Latency Regression')
  })

  it('highlights the evidence behind a citation when it is clicked', async () => {
    const user = userEvent.setup()
    renderIncident()
    await waitFor(() => expect(screen.getByTestId('hypothesis-1')).toBeInTheDocument())

    const chip = screen.getAllByRole('button', { name: 'K1' })[0]
    await user.click(chip)

    expect(screen.getByTestId('evidence-K1').className).toContain('border-info')
  })

  it('shows the proposed action and requires approval before executing', async () => {
    const user = userEvent.setup()
    renderIncident()
    await waitFor(() => expect(screen.getByTestId('remediation-plan')).toBeInTheDocument())

    expect(screen.getByTestId('remediation-plan')).toHaveTextContent('rollback_deployment')
    expect(mocked.approve).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /approve and execute/i }))
    await waitFor(() => expect(mocked.approve).toHaveBeenCalledWith(7, 31, 'operator'))
  })

  it('can reject the proposed action', async () => {
    const user = userEvent.setup()
    renderIncident()
    await waitFor(() => expect(screen.getByTestId('remediation-plan')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /reject/i }))
    await waitFor(() => expect(mocked.reject).toHaveBeenCalled())
    expect(mocked.approve).not.toHaveBeenCalled()
  })

  it('renders the audit timeline', async () => {
    renderIncident()
    await waitFor(() => expect(screen.getByTestId('timeline')).toBeInTheDocument())
    expect(screen.getByTestId('timeline')).toHaveTextContent('detected')
    expect(screen.getByTestId('timeline')).toHaveTextContent('remediation proposed')
  })
})
