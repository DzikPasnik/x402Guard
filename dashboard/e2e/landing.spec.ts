import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('renders hero title and description', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Autonomous DeFi Agents')).toBeVisible()
    await expect(page.getByText('non-custodial safety proxy')).toBeVisible()
  })

  test('has dashboard and github links', async ({ page }) => {
    await page.goto('/')
    // Nav has "Launch Dashboard" link
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Launch Dashboard' })).toBeVisible()
    // Hero also has "Launch Dashboard" — use main to scope
    await expect(page.getByRole('main').getByRole('link', { name: 'Launch Dashboard' })).toBeVisible()
    // View Source link to GitHub
    await expect(page.getByRole('link', { name: 'View Source' })).toBeVisible()
  })
})
