import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('unauthenticated user is redirected to /login from home', async ({ page }) => {
    // Mock auth/me to return 401 (not authenticated)
    await page.route('**/auth/me', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not authenticated' }),
      })
    })

    await page.goto('/')

    // Should redirect to /login
    await page.waitForURL('**/login')
    await expect(page).toHaveURL(/\/login/)
  })

  test('dashboard page exists for authenticated users', async ({ page }) => {
    // Mock auth to return an authenticated user
    await page.route('**/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '1', email: 'admin@alkosto.com', role: 'ADMIN' }),
      })
    })

    // Mock the dashboard data endpoints
    await page.route('**/runs?*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0, page: 1, limit: 20 }),
      })
    })

    await page.goto('/dashboard')
    // The page should load without errors
    await expect(page.locator('body')).toBeVisible()
  })

  test('runs page exists for authenticated users', async ({ page }) => {
    await page.route('**/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '1', email: 'admin@alkosto.com', role: 'ADMIN' }),
      })
    })

    await page.route('**/runs?*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0, page: 1, limit: 20 }),
      })
    })

    await page.goto('/runs')
    await expect(page.locator('body')).toBeVisible()
  })

  test('admin users page exists', async ({ page }) => {
    await page.route('**/auth/me', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '1', email: 'admin@alkosto.com', role: 'ADMIN' }),
      })
    })

    await page.route('**/users*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/admin/users')
    await expect(page.locator('body')).toBeVisible()
  })

  test('login page is accessible without authentication', async ({ page }) => {
    await page.goto('/login')
    // Login page should render without any API calls
    await expect(page.locator('h1')).toContainText('Iniciar Sesión')
  })
})
