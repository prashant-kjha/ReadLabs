const { test, expect } = require('@playwright/test');
const { loginAsStudent, loginAsTeacher, mockStudentApiRoutes, mockTeacherApiRoutes } = require('./helpers');


test.describe('Mobile/tablet viewport sanity', () => {

  test('auth page renders without horizontal scroll', async ({ page }) => {
    await page.goto('/auth');
    const overflowX = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth;
    });
    expect(overflowX).toBe(false);
  });

  test('student dashboard renders without horizontal scroll', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    const overflowX = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth;
    });
    expect(overflowX).toBe(false);
  });

  test('reading page is usable (sections sidebar accessible)', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/read/test-assignment-uuid');
    const sectionsToggle = page.locator('[data-testid="sections-toggle"], [data-testid="mobile-menu"]');
    await expect(sectionsToggle.first()).toBeVisible({ timeout: 5000 });
  });

  test('teacher papers page renders without horizontal scroll', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    const overflowX = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth > el.clientWidth;
    });
    expect(overflowX).toBe(false);
  });
});
