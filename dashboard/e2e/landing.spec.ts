import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('renders hero title and description', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'x402Guard' })).toBeVisible()
    await expect(page.getByText('Non-custodial x402 safety proxy')).toBeVisible()
  })

  test('has dashboard and github links', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Launch Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View on GitHub' })).toBeVisible()
  })
})
