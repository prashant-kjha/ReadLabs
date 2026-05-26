/**
 * ReadLabs - Landing Page Tests
 * Tests the public landing page: content, navigation, responsiveness.
 */
const { test, expect } = require('@playwright/test');

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the hero section with main heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Read Research Papers/i })).toBeVisible();
    await expect(page.getByText('Like a Pro')).toBeVisible();
  });

  test('shows the ReadLabs branding in navbar', async ({ page }) => {
    const brand = page.getByText('ReadLabs').first();
    await expect(brand).toBeVisible();
  });

  test('has Get Started and Login buttons in navbar', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Get Started' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('shows "How It Works" section with 3 steps', async ({ page }) => {
    const howSection = page.locator('#how-it-works');
    await expect(howSection).toBeVisible();

    await expect(page.getByText('Upload a Paper')).toBeVisible();
    await expect(page.getByText('AI Generates Your Guide')).toBeVisible();
    await expect(page.getByText('Read Interactively')).toBeVisible();
  });

  test('displays the features grid with 6 features', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Guided Reading' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI Checkpoints' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jargon Lookup' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comprehension Quizzes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Streaks & XP' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Critical Thinking' })).toBeVisible();
  });

  test('shows For Teachers and For Students sections', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'For Teachers' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'For Students' })).toBeVisible();
  });

  test('has CTA section', async ({ page }) => {
    await expect(page.getByText('Start Reading Smarter Today')).toBeVisible();
  });

  test('shows footer with copyright', async ({ page }) => {
    const year = new Date().getFullYear();
    await expect(page.getByText(`© ${year} ReadLabs`)).toBeVisible();
  });

  test('navigates to auth page when Get Started is clicked', async ({ page }) => {
    const getStartedButtons = page.getByRole('button', { name: /Get Started/ });
    await getStartedButtons.first().click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('navigates to auth page when Login is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('scrolls to How It Works section when button is clicked', async ({ page }) => {
    await page.getByRole('button', { name: /See How It Works/i }).click();
    await page.waitForTimeout(500);
    const howSection = page.locator('#how-it-works');
    await expect(howSection).toBeInViewport();
  });

  test('redirects logged-in users away from landing page', async ({ page }) => {
    // Set teacher auth in localStorage
    await page.evaluate(() => {
      localStorage.setItem('readlabs_user', JSON.stringify({
        id: 't1', email: 't@test.com', name: 'Teacher', role: 'teacher', access_token: 'tok',
      }));
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/teacher\/papers/);
  });
});
