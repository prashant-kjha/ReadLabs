/**
 * ReadLabs - Teacher Landmark Library (assign-to-class) Tests
 */
const { test, expect } = require('@playwright/test');
const { loginAsTeacher, mockTeacherApiRoutes } = require('./helpers');

test.describe('Teacher - Landmark Library assign', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/library');
    await page.waitForLoadState('networkidle');
  });

  test('shows teacher heading and Assign-to-class action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Landmark Papers' })).toBeVisible();
    await expect(page.getByText('Teacher · Landmark Library')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign to class' }).first()).toBeVisible();
  });

  test('does not show the student-only Start Reading action', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start Reading' })).toHaveCount(0);
  });

  test('can pick a level, open the modal, and assign to a class', async ({ page }) => {
    // Pick the advanced level on the card.
    await page.getByRole('button', { name: 'advanced' }).first().click();
    // Open the assign modal.
    await page.getByRole('button', { name: 'Assign to class' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Assign to class' });
    await expect(dialog).toBeVisible();
    // The first class (Biology 101) is auto-selected, so Assign is enabled.
    const assignBtn = dialog.getByRole('button', { name: 'Assign' });
    await expect(assignBtn).toBeEnabled();
    // Confirm the assignment.
    await assignBtn.click();
    // The success toast names the class it assigned to — proves the class list
    // loaded and the POST resolved against the /landmark/assign mock.
    await expect(page.getByText(/Assigned to Biology 101/)).toBeVisible({ timeout: 5000 });
  });
});
