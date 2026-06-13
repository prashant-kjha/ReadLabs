/**
 * Showcase screenshots — captures every redesigned page with mocked data.
 * Not part of the regression suite; run with:
 *   npx playwright test showcase-screenshots --reporter=list
 */
const { test } = require('@playwright/test');
const {
  loginAsTeacher,
  loginAsStudent,
  mockTeacherApiRoutes,
  mockStudentApiRoutes,
} = require('./helpers');

const OUT = 'showcase';

async function shoot(page, name, opts = {}) {
  await page.waitForTimeout(900); // let fonts/animations settle
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    fullPage: opts.fullPage ?? false,
  });
}

test.describe('showcase', () => {
  test('landing — light', async ({ page }) => {
    await page.goto('/');
    await shoot(page, '01-landing-hero');
    await page.screenshot({ path: `${OUT}/02-landing-full.png`, fullPage: true });
  });

  test('landing — dark', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('readlabs_theme', 'dark'));
    await page.reload();
    await shoot(page, '03-landing-hero-dark');
  });

  test('auth', async ({ page }) => {
    await page.goto('/auth');
    await shoot(page, '04-auth');
  });

  test('teacher papers', async ({ page }) => {
    await loginAsTeacher(page);
    mockTeacherApiRoutes(page);
    await page.goto('/teacher/papers');
    await shoot(page, '05-teacher-papers');
  });

  test('teacher classes', async ({ page }) => {
    await loginAsTeacher(page);
    mockTeacherApiRoutes(page);
    await page.goto('/teacher/classes');
    await shoot(page, '06-teacher-classes');
  });

  test('teacher dashboard', async ({ page }) => {
    await loginAsTeacher(page);
    mockTeacherApiRoutes(page);
    await page.goto('/teacher/classes/c1/dashboard');
    await shoot(page, '07-teacher-dashboard');
  });

  test('student dashboard', async ({ page }) => {
    await loginAsStudent(page);
    mockStudentApiRoutes(page);
    await page.goto('/student/dashboard');
    await shoot(page, '08-student-dashboard');
  });

  test('student self-study', async ({ page }) => {
    await loginAsStudent(page);
    mockStudentApiRoutes(page);
    await page.goto('/student/self-study');
    await shoot(page, '09-student-self-study');
  });

  test('student reading page', async ({ page }) => {
    await loginAsStudent(page);
    mockStudentApiRoutes(page);
    await page.goto('/student/read/a1');
    await page.waitForTimeout(1500);
    await shoot(page, '10-reading-page');
  });

  test('student dashboard — dark', async ({ page }) => {
    await loginAsStudent(page);
    mockStudentApiRoutes(page);
    await page.goto('/student/dashboard');
    await page.evaluate(() => localStorage.setItem('readlabs_theme', 'dark'));
    await page.reload();
    await shoot(page, '11-student-dashboard-dark');
  });
});
