/**
 * ReadLabs - Landmark Library Page Tests
 */
const { test, expect } = require('@playwright/test');
const { loginAsStudent, mockStudentApiRoutes } = require('./helpers');

test.describe('Student - Landmark Library Page', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/library');
    await page.waitForLoadState('networkidle');
  });

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Landmark Papers' })).toBeVisible();
  });

  test('displays landmark papers', async ({ page }) => {
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
  });

  test('shows level selector pills', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'intermediate' }).first()).toBeVisible();
  });

  test('has Start Reading button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start Reading' }).first()).toBeVisible();
  });

  test('can search papers', async ({ page }) => {
    await page.getByPlaceholder('Search landmark papers...').fill('attention');
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
  });

  test('clicking Start Reading navigates to reading page', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Reading' }).first().click();
    await expect(page).toHaveURL(/\/student\/read\//);
  });
});
