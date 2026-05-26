const { test, expect } = require('@playwright/test');
const { loginAsStudent, mockStudentApiRoutes } = require('./helpers');


test.describe('Cleanup verification: post-May-1 fixes', () => {

  test('jargon lookup sends the typed term in request body', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);

    let capturedBody = null;
    await page.route('**/api/v1/sessions/*/jargon', async (route, request) => {
      capturedBody = JSON.parse(request.postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'jl-1',
          term: capturedBody.term,
          explanation: 'A test explanation',
          feedback_pending: false,
        }),
      });
    });

    await page.goto('/student/read/test-assignment-uuid');
    await page.waitForSelector('[data-testid="jargon-input"]', { timeout: 10000 });
    await page.fill('[data-testid="jargon-input"]', 'regression coefficient');
    await page.click('[data-testid="jargon-lookup-button"]');

    await page.waitForResponse('**/jargon');

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.term).toBe('regression coefficient');
    expect(capturedBody.term).not.toBe('');
  });

  test('self-study upload form has no category field', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);

    await page.goto('/student/self-study');
    const categoryField = page.locator('[name="category"]');
    await expect(categoryField).toHaveCount(0);
  });

  test('email-confirmation panel shown after signup', async ({ page }) => {
    await page.route('**/api/v1/auth/signup', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: 'u-1',
          email_confirmation_required: true,
        }),
      })
    );

    await page.goto('/auth');
    await page.click('text=/sign up/i');
    await page.fill('[name="name"]', 'Test User');
    await page.fill('[name="email"]', 'newuser@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/check your email/i').first()).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/auth');
    const storedUser = await page.evaluate(() => localStorage.getItem('readlabs_user'));
    expect(storedUser).toBeNull();
  });

  test('signin shows email-not-confirmed message when backend says so', async ({ page }) => {
    await page.route('**/api/v1/auth/signin', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Email not confirmed. Check your inbox for a confirmation link.',
        }),
      })
    );

    await page.goto('/auth');
    await page.fill('[name="email"]', 'unconfirmed@test.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/email not confirmed/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('signup response no longer contains access_token (auth contract regression guard)', async ({ page }) => {
    let signupResponseBody = null;
    await page.route('**/api/v1/auth/signup', async (route) => {
      const response = {
        user_id: 'u-1',
        email_confirmation_required: true,
      };
      signupResponseBody = response;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });

    await page.goto('/auth');
    await page.click('text=/sign up/i');
    await page.fill('[name="name"]', 'X');
    await page.fill('[name="email"]', 'x@y.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForResponse('**/signup');

    expect(signupResponseBody).toMatchObject({ user_id: expect.any(String) });
    expect(signupResponseBody).not.toHaveProperty('access_token');
    expect(signupResponseBody).not.toHaveProperty('refresh_token');
  });
});
