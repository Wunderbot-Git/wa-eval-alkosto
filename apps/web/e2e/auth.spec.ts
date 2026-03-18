import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')

    await expect(page.locator('h1')).toContainText('Iniciar Sesión')
    await expect(page.locator('input#email')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('login form has required email and password fields', async ({ page }) => {
    await page.goto('/login')

    // Verify that the email field is a proper email input
    const emailInput = page.locator('input#email')
    await expect(emailInput).toHaveAttribute('type', 'email')

    // Verify that the password field is a proper password input
    const passwordInput = page.locator('input#password')
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('shows error on invalid credentials', async ({ page }) => {
    // Mock the login API to return 401
    await page.route('**/auth/login', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Credenciales inválidas' }),
      })
    })

    await page.goto('/login')

    // Fill in the form
    await page.locator('input#email').fill('wrong@email.com')
    await page.locator('input#password').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()

    // Wait for error message to appear
    const errorMessage = page.locator('[role="alert"]')
    await expect(errorMessage).toBeVisible()
    await expect(errorMessage).toContainText('Credenciales inválidas')
  })

  test('shows client-side error when email is empty', async ({ page }) => {
    await page.goto('/login')

    // Only fill password, leave email empty
    await page.locator('input#password').fill('somepassword')
    await page.locator('button[type="submit"]').click()

    // Should show client-side validation error
    const errorMessage = page.locator('[role="alert"]')
    await expect(errorMessage).toBeVisible()
    await expect(errorMessage).toContainText('correo es requerido')
  })

  test('shows client-side error when password is empty', async ({ page }) => {
    await page.goto('/login')

    // Only fill email, leave password empty
    await page.locator('input#email').fill('user@alkosto.com')
    await page.locator('button[type="submit"]').click()

    // Should show client-side validation error
    const errorMessage = page.locator('[role="alert"]')
    await expect(errorMessage).toBeVisible()
    await expect(errorMessage).toContainText('contraseña es requerida')
  })
})
