/**
 * ReadLabAI - Landing Page Extended Tests
 * Tests scroll behavior, testimonials, feature descriptions, footer content.
 */
const { test, expect } = require('@playwright/test');

test.describe('Landing Page - Extended', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('navbar changes style on scroll', async ({ page }) => {
    const nav = page.locator('nav.fixed');
    // Initially transparent
    await expect(nav).toHaveClass(/bg-transparent/);
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(400);
    // Should now have shadow/card class
    await expect(nav).toHaveClass(/shadow-card/);
  });

  test('each feature card has a description', async ({ page }) => {
    const descriptions = [
      'Section-by-section guiding questions tell you what to look for before you read.',
      'Write responses at each section and get instant AI feedback on your understanding.',
      'Look up any scientific term and get a plain-language explanation instantly.',
      'Multiple choice and short answer quizzes graded by AI after reading.',
      'Targeted prompts that push you to analyze, evaluate, and think deeper about each section.',
      'Earn XP for every section, checkpoint, and quiz. Build your reading streak.',
    ];
    for (const desc of descriptions) {
      await expect(page.getByText(desc)).toBeVisible();
    }
  });

  test('testimonials show 5-star ratings', async ({ page }) => {
    const starIcons = page.locator('.fill-amber-400');
    // 3 testimonials x 5 stars = 15 star icons
    const count = await starIcons.count();
    expect(count).toBe(15);
  });

  test('teacher section has 4 checklist items', async ({ page }) => {
    const forTeachers = page.getByRole('heading', { name: 'For Teachers' }).locator('xpath=ancestor::div[contains(@class, "card-hover")]');
    const teacherChecks = [
      'Upload papers and assign them to your classes',
      'Review student responses and reading progress',
      'Get class-wide insights and analytics',
      'Manage classes with join codes and student rosters',
    ];
    for (const item of teacherChecks) {
      await expect(forTeachers.getByText(item)).toBeVisible();
    }
  });

  test('student section has 4 checklist items', async ({ page }) => {
    const studentChecks = [
      'Self-study library with open-access research papers',
      'Guided reading with AI-powered assistance',
      'Interactive quizzes to test understanding',
      'Earn XP and build your reading streak',
    ];
    for (const item of studentChecks) {
      await expect(page.getByText(item)).toBeVisible();
    }
  });

  test('footer shows "Built for curious minds" tagline', async ({ page }) => {
    await expect(page.getByText('Built for curious minds')).toBeVisible();
  });

  test('CTA section has Get Started Free button', async ({ page }) => {
    // The CTA button text is "Get Started Free"
    const ctaButton = page.getByText('Get Started Free').first();
    await expect(ctaButton).toBeVisible();
    await ctaButton.click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('hero section shows subheading about AI-guided reading', async ({ page }) => {
    await expect(page.getByText(/AI-guided reading that breaks down complex research/)).toBeVisible();
  });

  test('how it works shows step descriptions', async ({ page }) => {
    await expect(page.getByText('Paste a URL or upload a PDF')).toBeVisible();
    await expect(page.getByText('Guiding questions, checkpoints, and quizzes')).toBeVisible();
    await expect(page.getByText('Work through each section with AI prompts')).toBeVisible();
  });
});
