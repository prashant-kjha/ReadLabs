const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { loginAsStudent, loginAsTeacher, mockStudentApiRoutes, mockTeacherApiRoutes } = require('./helpers');


async function scan(page, name) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  const moderate = results.violations.filter((v) => v.impact === 'moderate');

  if (moderate.length > 0) {
    console.log(`[a11y][${name}] ${moderate.length} moderate violations:`);
    for (const v of moderate) {
      console.log(`  - ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
    }
  }

  if (serious.length > 0) {
    const summary = serious
      .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} nodes`)
      .join('\n  ');
    throw new Error(`${name}: ${serious.length} serious/critical a11y violations:\n  ${summary}`);
  }
}


test.describe('Accessibility baseline', () => {

  test('landing page', async ({ page }) => {
    await page.goto('/');
    await scan(page, 'landing');
  });

  test('auth page', async ({ page }) => {
    await page.goto('/auth');
    await scan(page, 'auth');
  });

  test('student dashboard', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/dashboard');
    await scan(page, 'student-dashboard');
  });

  test('student self-study', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/self-study');
    await scan(page, 'student-self-study');
  });

  test('student reading page', async ({ page }) => {
    await loginAsStudent(page);
    await mockStudentApiRoutes(page);
    await page.goto('/student/read/test-assignment-uuid');
    await scan(page, 'student-reading');
  });

  test('teacher papers page', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/papers');
    await scan(page, 'teacher-papers');
  });

  test('teacher classes page', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/classes');
    await scan(page, 'teacher-classes');
  });

  test('teacher dashboard', async ({ page }) => {
    await loginAsTeacher(page);
    await mockTeacherApiRoutes(page);
    await page.goto('/teacher/dashboard/c1');
    await scan(page, 'teacher-dashboard');
  });
});
