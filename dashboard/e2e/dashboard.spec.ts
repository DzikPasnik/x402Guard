import { test, expect } from '@playwright/test'

// These tests run with DEV_SKIP_AUTH=true (set in playwright.config.ts webServer.env)
// so the dashboard is accessible without wallet authentication.
test.describe('Dashboard (dev mode)', () => {
  test('renders dashboard layout with sidebar and heading', async ({ page }) => {
    await page.goto('/dashboard')
    // Header shows profile dropdown trigger
    await expect(page.locator('header').getByRole('button', { name: /profile/i })).toBeVisible()
    // Agents heading from the dashboard page
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()
  })

  test('shows agents description text', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('Monitor and manage your x402Guard agents')).toBeVisible()
  })

  test('sidebar contains navigation links', async ({ page }) => {
    await page.goto('/dashboard')
    // AppSidebar nav items: "Overview" and "Audit Log"
    await expect(page.getByRole('link', { name: /overview/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /audit log/i })).toBeVisible()
  })

  test('navigates to audit logs page', async ({ page }) => {
    const response = await page.goto('/dashboard/logs')
    // Page may show an error page if the proxy API is not running,
    // but Next.js should still return a response (200 or error boundary).
    expect(response?.status()).toBeLessThan(500)
  })
})
