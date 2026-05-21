/**
 * ReadLabs - Theme Toggle Tests
 * Tests the theme toggle button functionality, persistence, and visual changes.
 */
const { test, expect } = require('@playwright/test');
const { loginAsTeacher, mockTeacherApiRoutes } = require('./helpers');

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
  });

  test('theme toggle button is visible in the navbar', async ({ page }) => {
    const toggle = page.locator('button[aria-label*="Switch to"]');
    await expect(toggle).toBeVisible();
  });

  test('defaults to light mode on first visit', async ({ page }) => {
    const root = page.locator('html');
    // Default is light (no 'dark' class)
    await expect(root).not.toHaveClass(/\bdark\b/);
  });

  test('clicking toggle switches to dark mode', async ({ page }) => {
    const toggle = page.locator('button[aria-label*="Switch to"]');
    await toggle.click();
    // HTML element should now have 'dark' class
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('clicking toggle twice returns to light mode', async ({ page }) => {
    const toggle = page.locator('button[aria-label*="Switch to"]');
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await toggle.click();
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  });

  test('aria-label updates to reflect next mode', async ({ page }) => {
    // In light mode, should say "Switch to dark mode"
    const toggle = page.locator('button[aria-label*="Switch to"]');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
    await toggle.click();
    // Now should say "Switch to light mode"
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
  });

  test('theme persists in localStorage', async ({ page }) => {
    const toggle = page.locator('button[aria-label*="Switch to"]');
    await toggle.click();
    // Check localStorage
    const stored = await page.evaluate(() => localStorage.getItem('readlab_theme'));
    expect(stored).toBe('dark');
  });

  test('theme is restored from localStorage on reload', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('readlab_theme', 'dark'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('theme toggle button has focus-visible styles', async ({ page }) => {
    const toggle = page.locator('button[aria-label*="Switch to"]');
    const className = await toggle.getAttribute('class');
    expect(className).toContain('focus-visible');
  });
});
