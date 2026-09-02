import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('renders headings without leaking the hash markers', () => {
    const { container } = render(<Markdown content={'# Title\n\n## Confirm the shape'} />)
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Confirm the shape')).toBeInTheDocument()
    expect(container.textContent).not.toContain('#')
  })

  it('joins wrapped paragraph lines into one paragraph', () => {
    render(<Markdown content={'A sentence that was\nhard wrapped in the source.'} />)
    expect(
      screen.getByText('A sentence that was hard wrapped in the source.'),
    ).toBeInTheDocument()
  })

  it('renders bullet and numbered lists', () => {
    const { container } = render(
      <Markdown content={'- first\n- second\n\n1. one\n2. two'} />,
    )
    const ul = container.querySelector('ul')
    const ol = container.querySelector('ol')
    expect(within(ul as HTMLElement).getByText('first')).toBeInTheDocument()
    expect(within(ol as HTMLElement).getByText('two')).toBeInTheDocument()
  })

  it('renders a table with its header row', () => {
    render(
      <Markdown
        content={'| Service | SLO |\n| --- | --- |\n| gateway | 400 ms |\n| payments-db | 150 ms |'}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Service' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'payments-db' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('renders inline bold and code without the markers', () => {
    const { container } = render(<Markdown content={'Set **max_connections** via `pg_settings`.'} />)
    expect(screen.getByText('max_connections').tagName).toBe('STRONG')
    expect(screen.getByText('pg_settings').tagName).toBe('CODE')
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).not.toContain('`')
  })

  it('never renders raw HTML from the source', () => {
    const { container } = render(<Markdown content={'<img src=x onerror=alert(1)>'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
