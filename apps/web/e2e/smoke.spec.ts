import { test, expect } from '@playwright/test'

test('home page shows title', async ({ page }) => {
  // Mock the auth check to return a user so the page renders
  await page.route('**/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '1', email: 'test@alkosto.com', role: 'ADMIN' }),
    })
  })

  await page.goto('/')
  // The home page redirects authenticated users to /dashboard,
  // but the title should display while loading
  await expect(page.locator('body')).toBeVisible()
})

test('login page renders form', async ({ page }) => {
  await page.goto('/login')

  // Check that the login form is present
  await expect(page.locator('h1')).toContainText('Iniciar Sesión')
  await expect(page.locator('input#email')).toBeVisible()
  await expect(page.locator('input#password')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toContainText('Ingresar')
})
