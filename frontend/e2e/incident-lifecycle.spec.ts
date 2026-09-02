import { expect, test } from '@playwright/test'

/**
 * The demo flow, end to end, against the real backend:
 * healthy platform -> inject failure -> detect -> investigate -> propose ->
 * human approves -> sandbox executes -> recovery verified -> resolved.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/lab')
  await page.getByRole('button', { name: /restore system/i }).click()
  await expect(page.getByText('none', { exact: true })).toBeVisible()
})

test('a healthy platform reports no incident', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
  await expect(page.getByTestId('platform-status')).toHaveText(/healthy/i, { timeout: 30_000 })
})

test('the system map renders the dependency graph', async ({ page }) => {
  await page.goto('/map')
  await expect(page.getByTestId('system-map')).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(6)
  await expect(page.locator('.react-flow__edge')).toHaveCount(6)
})

test('the knowledge base searches the indexed corpus', async ({ page }) => {
  await page.goto('/knowledge')
  await page.getByTestId('kb-search').fill('connection pool exhaustion replica maintenance')
  await expect(page.getByTestId('kb-results')).toContainText(/connection exhaustion/i)
})

test('inject, detect, investigate, approve, recover', async ({ page }) => {
  // 1. Inject a checkout latency regression from the Demo Lab.
  await page.goto('/lab')
  const card = page.locator('article', { hasText: 'Checkout latency regression' })
  await card.getByRole('button', { name: /inject failure/i }).click()
  await expect(card.getByText('active')).toBeVisible()

  // 2. The deterministic detector opens an incident within a few ticks.
  await page.goto('/')
  await expect(page.getByTestId('platform-status')).toHaveText(/degraded/i, { timeout: 45_000 })
  const incidentLink = page.getByTestId('incident-list').getByRole('link').first()
  await expect(incidentLink).toBeVisible({ timeout: 45_000 })
  await expect(incidentLink).toContainText('checkout-service')

  // 3. The investigation produced evidence, hypotheses and a proposed action.
  await incidentLink.click()
  await expect(page.getByTestId('incident-title')).toContainText('checkout-service')
  await expect(page.getByTestId('evidence-E1')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('evidence-E4')).toContainText(/checkout-service@4\.12\.0/)
  await expect(page.getByTestId('hypothesis-1')).toContainText(/bad deploy/i)
  await expect(page.getByTestId('remediation-plan')).toContainText('rollback_deployment')

  // 4. Nothing has executed yet: the workflow is parked on the approval gate.
  await expect(page.getByTestId('incident-status')).toContainText(/awaiting approval/i)
  await expect(page.getByTestId('timeline')).not.toContainText('remediation executed')

  // 5. A human approves, and only then does the action run.
  await page.getByRole('button', { name: /approve and execute/i }).click()
  await expect(page.getByTestId('timeline')).toContainText('remediation executed', {
    timeout: 30_000,
  })

  // 6. Recovery is verified deterministically and the incident resolves.
  await expect(page.getByTestId('incident-status')).toContainText(/resolved/i, { timeout: 60_000 })
  await expect(page.getByTestId('timeline')).toContainText('recovery verified')

  // 7. The platform is healthy again.
  await page.goto('/')
  await expect(page.getByTestId('platform-status')).toHaveText(/healthy/i, { timeout: 45_000 })
})

test('a rejected plan leaves the platform untouched', async ({ page }) => {
  await page.goto('/lab')
  const card = page.locator('article', { hasText: 'Authentication 5xx spike' })
  await card.getByRole('button', { name: /inject failure/i }).click()

  await page.goto('/')
  // Wait for the newest incident to be the auth one; earlier runs leave
  // resolved incidents in the list.
  const incidentLink = page.getByTestId('incident-list').getByRole('link').first()
  await expect(incidentLink).toContainText('auth-service', { timeout: 45_000 })
  await incidentLink.click()

  await expect(page.getByTestId('remediation-plan')).toContainText('revert_config', {
    timeout: 45_000,
  })
  await page.getByRole('button', { name: /^reject$/i }).click()

  await expect(page.getByTestId('timeline')).toContainText('rejected', { timeout: 30_000 })
  await expect(page.getByTestId('timeline')).not.toContainText('remediation executed')
})
