/**
 * ReadLabAI - Authentication Page Tests
 * Tests login/signup form, validation, and error handling.
 *
 * Note: AuthPage defaults to "signin" mode (useState("signin")).
 * As of the 2026-05-01 security review, signup is student-only and
 * triggers an email-confirmation flow rather than auto-login.
 */
const { test, expect } = require('@playwright/test');
const { mockAuthRoutes, TEACHER_USER, STUDENT_USER } = require('./helpers');

test.describe('Auth Page', () => {
  test.beforeEach(async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
  });

  test('displays the auth form with Sign Up / Log In tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sign Up', exact: true })).toBeVisible();
    // The "Log In" text appears on both the tab toggle and the submit button in signin mode
    // Use the tab toggle container to select the right one
    const tabContainer = page.locator('.flex.rounded-lg.bg-muted');
    await expect(tabContainer.getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
  });

  test('shows ReadLabAI branding', async ({ page }) => {
    const brand = page.getByText('ReadLabAI').first();
    await expect(brand).toBeVisible();
  });

  test('shows left decorative panel with feature list', async ({ page }) => {
    await expect(page.getByText('Understand Research.')).toBeVisible();
    await expect(page.getByText('Read Smarter')).toBeVisible();
    await expect(page.getByText('Think Critically')).toBeVisible();
    await expect(page.getByText('Earn Achievements')).toBeVisible();
  });

  test('starts in Log In (signin) mode by default', async ({ page }) => {
    // Default mode is "signin" — no Full Name field visible
    await expect(page.getByLabel('Full Name')).not.toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('switches to Sign Up mode when Sign Up tab is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    // Now Full Name field should be visible
    await expect(page.getByLabel('Full Name')).toBeVisible();
  });

  test('does NOT show role selection in Sign Up mode (security: student-only signup)', async ({ page }) => {
    // Role selector was removed in the 2026-05-01 security review.
    // Self-service signup always creates a student; teachers are provisioned manually.
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Teacher' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Student' })).not.toBeVisible();
  });

  test('does not show role selection in Log In mode', async ({ page }) => {
    // Already in signin mode by default
    await expect(page.getByRole('button', { name: 'Teacher' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Student' })).not.toBeVisible();
  });

  test('shows all form fields in Sign Up mode', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('shows email and password fields in Log In mode', async ({ page }) => {
    // Already in signin mode
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('has toggle link between modes', async ({ page }) => {
    // In signin mode: shows "Don't have an account? Sign up"
    await expect(page.getByText("Don't have an account?")).toBeVisible();
    // Click the bottom toggle link (not the tab) to switch to signup
    await page.locator('p.text-center button', { hasText: 'Sign up' }).click();
    // Now in signup mode: shows "Already have an account? Log in"
    await expect(page.getByText("Already have an account?")).toBeVisible();
    await page.locator('p.text-center button', { hasText: 'Log in' }).click();
    // Back to signin
    await expect(page.getByText("Don't have an account?")).toBeVisible();
  });

  test('redirects logged-in teacher to /teacher/papers', async ({ page }) => {
    await page.evaluate((user) => {
      localStorage.setItem('readlab_user', JSON.stringify(user));
    }, TEACHER_USER);
    await page.goto('/auth');
    await expect(page).toHaveURL(/\/teacher\/papers/);
  });

  test('redirects logged-in student to /student/dashboard', async ({ page }) => {
    await page.evaluate((user) => {
      localStorage.setItem('readlab_user', JSON.stringify(user));
    }, STUDENT_USER);
    await page.goto('/auth');
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('submit button shows loading state during submission', async ({ page }) => {
    // Delay the API response
    await page.route('**/api/v1/auth/signin', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({ json: TEACHER_USER });
    });

    // In signin mode
    await page.getByLabel('Email').fill('teacher@test.com');
    await page.getByLabel('Password').fill('password123');
    // Use form's submit button (not the tab toggle)
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText('Loading...')).toBeVisible();
  });

  test('displays error message on auth failure', async ({ page }) => {
    await page.route('**/api/v1/auth/signin', (route) => {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid email or password' }),
      });
    });

    // In signin mode
    await page.getByLabel('Email').fill('wrong@test.com');
    await page.getByLabel('Password').fill('wrong');
    await page.locator('form button[type="submit"]').click();
    // The error appears in both a toast and an inline error div — check the inline one
    const errorDiv = page.locator('.text-red-500 span', { hasText: 'Invalid email or password' });
    await expect(errorDiv).toBeVisible();
  });

  test('shows email-not-confirmed error when backend reports it', async ({ page }) => {
    await page.route('**/api/v1/auth/signin', (route) => {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Email not confirmed. Check your inbox for a confirmation link.' }),
      });
    });

    await page.getByLabel('Email').fill('unconfirmed@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();
    const errorDiv = page.locator('.text-red-500 span', { hasText: /Email not confirmed/i });
    await expect(errorDiv).toBeVisible();
  });
});
