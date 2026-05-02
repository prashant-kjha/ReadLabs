/**
 * ReadLabAI - Auth Page Extended Tests
 * Tests successful login flow, password masking, signup → email-confirmation flow.
 *
 * As of the 2026-05-01 security review, signup no longer auto-logs the user in;
 * it shows a "Check your email" panel and the user must confirm via email and
 * then sign in separately. Role selection has been removed entirely.
 */
const { test, expect } = require('@playwright/test');
const { mockAuthRoutes, TEACHER_USER, STUDENT_USER } = require('./helpers');

test.describe('Auth Page - Extended', () => {
  test.beforeEach(async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
  });

  test('password field is masked (type=password)', async ({ page }) => {
    const pwInput = page.getByLabel('Password');
    await expect(pwInput).toHaveAttribute('type', 'password');
  });

  test('email field has email type validation', async ({ page }) => {
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('successful login redirects teacher to /teacher/papers', async ({ page }) => {
    // Mock returns TEACHER_USER by default for signin
    await page.getByLabel('Email').fill('teacher@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/teacher\/papers/);
  });

  test('successful login stores user in localStorage', async ({ page }) => {
    await page.getByLabel('Email').fill('teacher@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/teacher\/papers/);
    const stored = await page.evaluate(() => localStorage.getItem('readlab_user'));
    const parsed = JSON.parse(stored);
    expect(parsed.role).toBe('teacher');
    expect(parsed.access_token).toBeTruthy();
  });

  test('successful student login redirects to /student/dashboard', async ({ page }) => {
    await page.route('**/api/v1/auth/signin', (route) => {
      return route.fulfill({ json: STUDENT_USER });
    });
    await page.getByLabel('Email').fill('student@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('successful signup shows email-confirmation panel (no auto-login)', async ({ page }) => {
    // mockAuthRoutes already returns the new shape, but be explicit here
    await page.route('**/api/v1/auth/signup', (route) => {
      return route.fulfill({
        json: { user_id: 'new-user-id', email_confirmation_required: true },
      });
    });

    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email').fill('newuser@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();

    // The "Check your email" panel should appear. Scope to the panel heading to
    // avoid colliding with the toast that contains the same string.
    const panelHeading = page.locator('p.font-medium', { hasText: 'Check your email' });
    await expect(panelHeading).toBeVisible();
    // The panel echoes the entered email back to the user.
    await expect(page.getByText('newuser@test.com')).toBeVisible();

    // We should NOT have been redirected anywhere — still on /auth.
    await expect(page).toHaveURL(/\/auth/);

    // No user record should be in localStorage (no auto-login).
    const stored = await page.evaluate(() => localStorage.getItem('readlab_user'));
    expect(stored).toBeNull();
  });

  test('signup confirmation panel has "Go to Log In" button that switches mode', async ({ page }) => {
    await page.route('**/api/v1/auth/signup', (route) => {
      return route.fulfill({
        json: { user_id: 'new-user-id', email_confirmation_required: true },
      });
    });

    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email').fill('newuser@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();

    const panelHeading = page.locator('p.font-medium', { hasText: 'Check your email' });
    await expect(panelHeading).toBeVisible();

    // Clicking "Go to Log In" should drop us back into signin mode with the form visible
    await page.getByRole('button', { name: 'Go to Log In' }).click();
    await expect(panelHeading).not.toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toHaveText(/Log In/);
  });

  test('signup payload does NOT include a role field (security)', async ({ page }) => {
    let capturedBody = null;
    await page.route('**/api/v1/auth/signup', async (route) => {
      const req = route.request();
      capturedBody = req.postDataJSON();
      return route.fulfill({
        json: { user_id: 'new-user-id', email_confirmation_required: true },
      });
    });

    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email').fill('newuser@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();

    const panelHeading = page.locator('p.font-medium', { hasText: 'Check your email' });
    await expect(panelHeading).toBeVisible();
    expect(capturedBody).not.toBeNull();
    expect(capturedBody).not.toHaveProperty('role');
    expect(capturedBody.email).toBe('newuser@test.com');
    expect(capturedBody.name).toBe('Test User');
  });

  test('name input has correct placeholder', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await expect(page.getByPlaceholder('Your full name')).toBeVisible();
  });

  test('email input has correct placeholder', async ({ page }) => {
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  });

  test('password input has correct placeholder', async ({ page }) => {
    await expect(page.getByPlaceholder('Your password')).toBeVisible();
  });

  test('form fields have correct types', async ({ page }) => {
    const emailInput = page.getByLabel('Email');
    const pwInput = page.getByLabel('Password');
    await expect(emailInput).toHaveAttribute('type', 'email');
    await expect(pwInput).toHaveAttribute('type', 'password');
  });

  test('signup name field is present in signup mode', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    const nameInput = page.getByLabel('Full Name');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveAttribute('type', 'text');
  });
});
