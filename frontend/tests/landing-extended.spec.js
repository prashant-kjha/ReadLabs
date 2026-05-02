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
      'Toggle between Original, Undergrad, High School, and ELI5 text levels.',
      'Highlight text, categorize by importance, and get AI Socratic prompts.',
      'Multiple choice + short answer quizzes graded by AI after reading.',
      'Earn XP for every section, checkpoint, and quiz. Build your reading streak.',
      'Understand study designs, sample sizes, and statistical tests in plain language.',
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
    const teacherChecks = [
      'Upload papers and assign them to your classes',
      'Review student responses and reading progress',
      'Get class-wide insights and analytics',
      'Customize reading levels for different groups',
    ];
    for (const item of teacherChecks) {
      await expect(page.getByText(item)).toBeVisible();
    }
  });

  test('student section has 4 checklist items', async ({ page }) => {
    const studentChecks = [
      'Self-study library with hundreds of papers',
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
    await expect(page.getByText('Guiding questions, reading levels, and quizzes')).toBeVisible();
    await expect(page.getByText('Work through each section with AI prompts')).toBeVisible();
  });
});
