import { expect, test } from '@playwright/test'

/**
 * Captures the screenshots used in the README from the running application.
 * Not part of the CI suite - run it deliberately:
 *   npx playwright test e2e/screenshots.spec.ts
 */

const SHOTS = '../docs/screenshots'

test('capture product screenshots', async ({ page }) => {
  test.setTimeout(180_000)

  // Healthy baseline.
  await page.goto('/lab')
  await page.getByRole('button', { name: /restore system/i }).click()
  await page.goto('/')
  await expect(page.getByTestId('platform-status')).toHaveText(/healthy/i, { timeout: 45_000 })
  await page.waitForTimeout(4000) // let a few samples land so the chart has a shape
  await page.screenshot({ path: `${SHOTS}/01-command-center-healthy.png`, fullPage: true })

  // Knowledge base with a live retrieval.
  await page.goto('/knowledge')
  await page.getByTestId('kb-search').fill('connection pool exhaustion replica maintenance')
  await expect(page.getByTestId('kb-results')).toContainText(/connection exhaustion/i)
  await page.getByRole('button', { name: /Runbook - Database Connection Exhaustion/i }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/05-knowledge-base.png`, fullPage: true })

  // Demo lab.
  await page.goto('/lab')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/06-demo-lab.png`, fullPage: true })

  // Inject a failure and let detection run.
  const card = page.locator('article', { hasText: 'Payments database connection exhaustion' })
  await card.getByRole('button', { name: /inject failure/i }).click()

  await page.goto('/')
  await expect(page.getByTestId('platform-status')).toHaveText(/degraded/i, { timeout: 45_000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/02-command-center-incident.png`, fullPage: true })

  // System map showing propagation.
  await page.goto('/map')
  await expect(page.getByTestId('system-map')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/04-system-map.png`, fullPage: true })

  // Investigation, parked on the approval gate.
  await page.goto('/')
  const incidentLink = page.getByTestId('incident-list').getByRole('link').first()
  await expect(incidentLink).toContainText('payments-db', { timeout: 45_000 })
  await incidentLink.click()
  await expect(page.getByTestId('remediation-plan')).toContainText('increase_connection_pool', {
    timeout: 45_000,
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/03-incident-investigation.png`, fullPage: true })

  // Approve, then capture the resolved incident with its full audit trail.
  await page.getByRole('button', { name: /approve and execute/i }).click()
  await expect(page.getByTestId('incident-status')).toContainText(/resolved/i, { timeout: 60_000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/07-incident-resolved.png`, fullPage: true })

  // Back to healthy.
  await page.goto('/')
  await expect(page.getByTestId('platform-status')).toHaveText(/healthy/i, { timeout: 45_000 })
})
