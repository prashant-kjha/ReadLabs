/**
 * ReadLabs - Google sign-in tests
 * Covers the "Continue with Google" button on the auth page and the
 * /auth/callback OAuth landing page.
 *
 * The real Google redirect can't run in E2E (external origin); these tests
 * cover the UI states around it. The backend side (/auth/oauth/profile) is
 * covered by pytest.
 */
const { test, expect } = require('@playwright/test');
const { mockAuthRoutes } = require('./helpers');

test.describe('Google sign-in button', () => {
  test.beforeEach(async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
  });

  test('shows Continue with Google in Log In mode', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('shows Continue with Google in Sign Up mode', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('Google button sits below an "or" divider, not inside the form', async ({ page }) => {
    // Keyboard-submitting the email form must not trigger the Google flow.
    const googleButton = page.getByRole('button', { name: 'Continue with Google' });
    await expect(googleButton).toHaveAttribute('type', 'button');
    await expect(page.getByText('or', { exact: true })).toBeVisible();
  });
});

test.describe('OAuth callback page', () => {
  test('shows completing state while waiting for a session', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page.getByText('Completing sign-in…')).toBeVisible();
  });

  test('surfaces a provider error carried in the URL', async ({ page }) => {
    await page.goto('/auth/callback#error=access_denied&error_description=User+cancelled');
    const errorDiv = page.locator('.text-red-500 span', { hasText: 'User cancelled' });
    await expect(errorDiv).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
  });

  test('falls back to an error when no session ever arrives', async ({ page }) => {
    await page.goto('/auth/callback');
    // The page polls for ~5s before giving up.
    const errorDiv = page.locator('.text-red-500 span', {
      hasText: "Sign-in didn't complete",
    });
    await expect(errorDiv).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
  });

  test('Back to sign in link returns to /auth', async ({ page }) => {
    await page.goto('/auth/callback#error=access_denied&error_description=User+cancelled');
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/auth$/);
  });
});
