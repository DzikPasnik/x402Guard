import { test, expect } from '@playwright/test'

test.describe('Login Page', () => {
  test('renders login card with wallet connect', async ({ page }) => {
    await page.goto('/login')
    // CardTitle renders x402Guard (not as heading role)
    await expect(page.getByText('x402Guard').first()).toBeVisible()
    await expect(page.getByText('Connect your wallet')).toBeVisible()
    await expect(page.getByText('Sign-In with Ethereum')).toBeVisible()
  })

  test('shows Connect Wallet button', async ({ page }) => {
    await page.goto('/login')
    // RainbowKit renders a "Connect Wallet" button
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible()
  })
})
