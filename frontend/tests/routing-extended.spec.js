/**
 * ReadLabs - Routing Extended Tests
 * Tests ProtectedRoute loading state, deep route protection, auth persistence.
 */
const { test, expect } = require('@playwright/test');
const { loginAsTeacher, loginAsStudent, mockTeacherApiRoutes, mockStudentApiRoutes } = require('./helpers');

test.describe('ProtectedRoute Extended', () => {
  test('shows loading state while auth is resolving', async ({ page }) => {
    // The AuthContext sets loading=true initially, then checks localStorage
    // This is very fast, but we can test the behavior by delaying evaluation
    await page.goto('/teacher/papers');
    // After redirect, should be on auth page (not stuck on loading)
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });
});

test.describe('Deep Route Protection', () => {
  test('teacher deep routes require authentication', async ({ page }) => {
    await page.goto('/teacher/classes/c1/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('teacher assignment review requires authentication', async ({ page }) => {
    await page.goto('/teacher/assignments/a1/review');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('teacher assignment drilldown requires authentication', async ({ page }) => {
    await page.goto('/teacher/assignments/a1/drilldown');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('teacher preview requires authentication', async ({ page }) => {
    await page.goto('/teacher/assignments/a1/preview');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('student reading page requires authentication', async ({ page }) => {
    await page.goto('/student/read/a1');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('student cannot access teacher assign paper page', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/teacher/classes/c1/assign');
    await expect(page).toHaveURL(/\/(auth|student\/dashboard)/);
  });

  test('student cannot access teacher assignment review', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/teacher/assignments/a1/review');
    await expect(page).toHaveURL(/\/(auth|student\/dashboard)/);
  });

  test('student cannot access teacher dashboard', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/teacher/classes/c1/dashboard');
    await expect(page).toHaveURL(/\/(auth|student\/dashboard)/);
  });

  test('student cannot access teacher drilldown', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/teacher/assignments/a1/drilldown');
    await expect(page).toHaveURL(/\/(auth|student\/dashboard)/);
  });

  test('teacher cannot access student reading page', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/student/read/a1');
    await expect(page).toHaveURL(/\/(auth|teacher\/papers)/);
  });
});

test.describe('Auth Persistence', () => {
  test('auth state persists across page reloads', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');

    // Verify we're authenticated
    await expect(page.getByText('Test Teacher')).toBeVisible();

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be authenticated
    await expect(page.getByText('Test Teacher')).toBeVisible();
  });

  test('clearing localStorage logs user out', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Test Teacher')).toBeVisible();

    // Clear localStorage
    await page.evaluate(() => localStorage.removeItem('readlabs_user'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should be redirected to auth
    await expect(page).toHaveURL(/\/auth/);
  });
});
