/**
 * ReadLabs - Student Landmark Library Progress (Phase 3) Tests
 */
const { test, expect } = require('@playwright/test');
const { loginAsStudent, mockStudentApiRoutes } = require('./helpers');

test.describe('Student - Landmark Library progress', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/library');
    await page.waitForLoadState('networkidle');
  });

  test('shows the My Progress summary counts over the loaded set', async ({ page }) => {
    // lp1 in progress + lp2 completed = 2 started; lp2 = 1 completed.
    const summary = page.getByTestId('landmark-progress-summary');
    await expect(summary).toContainText('2 started');
    await expect(summary).toContainText('1 completed');
  });

  test('shows all three papers by default', async ({ page }) => {
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(3);
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
    await expect(page.getByText('Deep Residual Learning for Image Recognition')).toBeVisible();
    await expect(page.getByText('Generative Adversarial Networks')).toBeVisible();
  });

  test('the In-progress filter shows only the in-progress paper with a Continue CTA', async ({ page }) => {
    await page.getByRole('button', { name: 'In progress' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
    // current_section_index 1 → resume label "section 2".
    await expect(page.getByTestId('landmark-card-status')).toContainText('In progress · section 2');
    await expect(page.getByRole('button', { name: 'Continue Reading' })).toBeVisible();
  });

  test('the Completed filter shows only the completed paper', async ({ page }) => {
    await page.getByRole('button', { name: 'Completed' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await expect(page.getByText('Deep Residual Learning for Image Recognition')).toBeVisible();
  });

  test('the Not-started filter shows only the not-started paper', async ({ page }) => {
    await page.getByRole('button', { name: 'Not started' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await expect(page.getByText('Generative Adversarial Networks')).toBeVisible();
  });

  test('All restores the full set after filtering', async ({ page }) => {
    await page.getByRole('button', { name: 'Completed' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(1);
    await page.getByRole('button', { name: 'All' }).click();
    await expect(page.locator('[data-testid=landmark-card]')).toHaveCount(3);
  });
});
