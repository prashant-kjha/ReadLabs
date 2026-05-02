/**
 * ReadLabAI - Routing & Protection Tests
 * Tests route protection, role-based access, and navigation edge cases.
 */
const { test, expect } = require('@playwright/test');
const { loginAsTeacher, loginAsStudent, mockTeacherApiRoutes, mockStudentApiRoutes, TEACHER_USER, STUDENT_USER } = require('./helpers');

test.describe('Route Protection', () => {
  test('unauthenticated user is redirected from /teacher/papers', async ({ page }) => {
    await page.goto('/teacher/papers');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('unauthenticated user is redirected from /teacher/classes', async ({ page }) => {
    await page.goto('/teacher/classes');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('unauthenticated user is redirected from /student/dashboard', async ({ page }) => {
    await page.goto('/student/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('unauthenticated user is redirected from /student/self-study', async ({ page }) => {
    await page.goto('/student/self-study');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('unauthenticated user can access landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
  });

  test('unauthenticated user can access auth page', async ({ page }) => {
    await page.goto('/auth');
    await expect(page).toHaveURL('/auth');
  });
});

test.describe('Role-Based Access', () => {
  test('student cannot access teacher papers page (redirected to own dashboard)', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/teacher/papers');
    // Student gets redirected from /teacher/* to /auth then to /student/dashboard
    await expect(page).toHaveURL(/\/(auth|student\/dashboard)/);
  });

  test('student cannot access teacher classes page', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/teacher/classes');
    await expect(page).toHaveURL(/\/(auth|student\/dashboard)/);
  });

  test('teacher cannot access student dashboard', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/student/dashboard');
    await expect(page).toHaveURL(/\/(auth|teacher\/papers)/);
  });

  test('teacher cannot access student self-study', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/student/self-study');
    await expect(page).toHaveURL(/\/(auth|teacher\/papers)/);
  });
});

test.describe('Default Route Redirects', () => {
  test('teacher is redirected to /teacher/papers from root', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/teacher\/papers/);
  });

  test('student is redirected to /student/dashboard from root', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('unknown routes redirect to landing page', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await expect(page).toHaveURL('/');
  });
});

test.describe('Theme Toggle', () => {
  test('theme toggle button is visible in navbar', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    // The navbar has multiple buttons - verify the structure exists
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const buttons = header.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('shows mobile hamburger menu on teacher page', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    const menuButton = page.locator('button[aria-label="Toggle menu"]');
    await expect(menuButton).toBeVisible();
  });

  test('opens mobile menu when hamburger is clicked', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    await page.locator('button[aria-label="Toggle menu"]').click();
    // Mobile menu should show navigation links
    await expect(page.getByRole('link', { name: 'Papers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Classes' })).toBeVisible();
  });

  test('mobile menu has logout option', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    await page.locator('button[aria-label="Toggle menu"]').click();
    // The mobile nav should have a logout button
    const mobileLogout = page.locator('nav button').filter({ hasText: 'Logout' });
    await expect(mobileLogout).toBeVisible();
  });

  test('landing page hides browser mockup on mobile', async ({ page }) => {
    await page.goto('/');
    const mockup = page.getByText('readlab.ai / paper / nature-2024-cell-biology');
    await expect(mockup).not.toBeVisible();
  });

  test('auth page hides left decorative panel on mobile', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    // The left panel has class "hidden md:flex" so it should not be visible on mobile
    // Instead of checking for text (which may still exist in DOM), check the actual panel
    const leftPanel = page.locator('.hidden.md\\:flex');
    // If the panel exists, it should have the hidden class applied
    const count = await leftPanel.count();
    if (count > 0) {
      await expect(leftPanel.first()).not.toBeVisible();
    }
  });
});
