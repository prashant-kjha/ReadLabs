/**
 * ReadLabAI - Teacher Pages Tests
 * Tests PapersPage, ClassesPage, AssignPaperPage, AssignmentReviewPage,
 * DashboardPage, AssignmentDrilldownPage.
 */
const { test, expect } = require('@playwright/test');
const { loginAsTeacher, mockTeacherApiRoutes, TEACHER_USER } = require('./helpers');

test.describe('Teacher - Layout & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
  });

  test('shows ReadLabAI branding in navbar', async ({ page }) => {
    await expect(page.getByText('ReadLabAI').first()).toBeVisible();
  });

  test('shows teacher navigation links (Papers, Classes)', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Papers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Classes' })).toBeVisible();
  });

  test('displays user name in navbar', async ({ page }) => {
    await expect(page.getByText(TEACHER_USER.name)).toBeVisible();
  });

  test('shows Logout button', async ({ page }) => {
    await expect(page.getByText('Logout')).toBeVisible();
  });

  test('does not show streak widget for teachers', async ({ page }) => {
    // Streak widget is only for students — look for XP text
    await expect(page.getByText(/\d+ XP/)).not.toBeVisible();
  });

  test('logout clears auth and redirects to /auth', async ({ page }) => {
    await page.getByText('Logout').click();
    await expect(page).toHaveURL(/\/auth/);
    const stored = await page.evaluate(() => localStorage.getItem('readlab_user'));
    expect(stored).toBeNull();
  });

  test('navigates between Papers and Classes pages', async ({ page }) => {
    await page.getByRole('link', { name: 'Classes' }).click();
    await expect(page).toHaveURL(/\/teacher\/classes/);
    await page.getByRole('link', { name: 'Papers' }).click();
    await expect(page).toHaveURL(/\/teacher\/papers/);
  });
});

test.describe('Teacher - Papers Page', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
  });

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Papers' })).toBeVisible();
  });

  test('shows upload section with title input and file picker', async ({ page }) => {
    await expect(page.getByText('Upload a Paper')).toBeVisible();
    await expect(page.getByPlaceholder('Paper title (optional)')).toBeVisible();
    await expect(page.getByText('Choose PDF')).toBeVisible();
  });

  test('displays uploaded papers list', async ({ page }) => {
    await expect(page.getByText('Neural Networks in Biology')).toBeVisible();
    await expect(page.getByText('CRISPR Gene Editing Review')).toBeVisible();
  });

  test('shows paper metadata (chars, figures)', async ({ page }) => {
    await expect(page.getByText('45,000 chars')).toBeVisible();
    await expect(page.getByText('6 figures')).toBeVisible();
  });

  test('shows file size constraint hint', async ({ page }) => {
    await expect(page.getByText('Max 20 MB')).toBeVisible();
  });
});

test.describe('Teacher - Classes Page', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/classes');
    await page.waitForLoadState('networkidle');
  });

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible();
  });

  test('shows create class form', async ({ page }) => {
    await expect(page.getByPlaceholder('New class name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('displays existing classes', async ({ page }) => {
    await expect(page.getByText('Biology 101')).toBeVisible();
    await expect(page.getByText('AP Chemistry')).toBeVisible();
  });

  test('shows class codes', async ({ page }) => {
    await expect(page.getByText('BIO-4X2K')).toBeVisible();
    await expect(page.getByText('CHEM-7R3M')).toBeVisible();
  });

  test('shows class detail when class is clicked', async ({ page }) => {
    await page.getByText('Biology 101').click();
    await expect(page.getByText('Alice Johnson')).toBeVisible();
    await expect(page.getByText('Bob Smith')).toBeVisible();
  });

  test('shows enrolled student count', async ({ page }) => {
    await page.getByText('Biology 101').click();
    await expect(page.getByText('2 students')).toBeVisible();
  });

  test('has Assign Paper and Dashboard buttons in class detail', async ({ page }) => {
    await page.getByText('Biology 101').click();
    await expect(page.getByRole('button', { name: 'Assign Paper' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  });

  test('navigates to Assign Paper page', async ({ page }) => {
    await page.getByText('Biology 101').click();
    await page.getByRole('button', { name: 'Assign Paper' }).click();
    await expect(page).toHaveURL(/\/teacher\/classes\/c1\/assign/);
  });

  test('navigates to Dashboard page', async ({ page }) => {
    await page.getByText('Biology 101').click();
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/teacher\/classes\/c1\/dashboard/);
  });

  test('shows remove button for enrolled students', async ({ page }) => {
    await page.getByText('Biology 101').click();
    await expect(page.getByText('Remove').first()).toBeVisible();
  });

  test('shows empty state for class with no students', async ({ page }) => {
    await page.getByText('AP Chemistry').click();
    await expect(page.getByText('No students enrolled yet.')).toBeVisible();
  });
});

test.describe('Teacher - Assign Paper Page', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/classes/c1/assign');
    await page.waitForLoadState('networkidle');
  });

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Assign a Paper' })).toBeVisible();
  });

  test('shows description text', async ({ page }) => {
    await expect(page.getByText('Select an uploaded paper')).toBeVisible();
  });

  test('displays available papers to select', async ({ page }) => {
    await expect(page.getByText('Neural Networks in Biology')).toBeVisible();
    await expect(page.getByText('CRISPR Gene Editing Review')).toBeVisible();
  });

  test('can select a paper by clicking', async ({ page }) => {
    await page.getByText('Neural Networks in Biology').click();
    // The parent button should have ring highlight
    const paperBtn = page.locator('button', { hasText: 'Neural Networks in Biology' });
    await expect(paperBtn).toHaveAttribute('class', /ring-2 ring-primary/);
  });

  test('Assign Paper button is disabled when no paper is selected', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Assign Paper' })).toBeDisabled();
  });

  test('Assign Paper button is enabled after selection', async ({ page }) => {
    await page.getByText('Neural Networks in Biology').click();
    await expect(page.getByRole('button', { name: 'Assign Paper' })).toBeEnabled();
  });
});

test.describe('Teacher - Assignment Review Page', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/review');
    await page.waitForLoadState('networkidle');
  });

  test('displays review heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Review Reading Guide' })).toBeVisible();
  });

  test('shows difficulty selector', async ({ page }) => {
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  test('displays the first section with its title', async ({ page }) => {
    // Use headings to avoid matching text in other sections
    await expect(page.getByRole('heading', { name: 'Introduction', exact: true })).toBeVisible();
  });

  test('shows guiding questions as editable inputs', async ({ page }) => {
    // The guiding questions are rendered as input[text] elements inside the review sections
    const questionInputs = page.locator('.card input[type="text"]');
    const count = await questionInputs.count();
    expect(count).toBeGreaterThan(0);
    // The first input should contain the first guiding question
    const firstValue = await questionInputs.first().inputValue();
    expect(firstValue).toBeTruthy();
  });

  test('shows key terms as badge elements', async ({ page }) => {
    // Use the badge selector to avoid matching text in paper content
    const keyTermBadges = page.locator('.badge.bg-muted');
    await expect(keyTermBadges.first()).toBeVisible();
    // Check that at least one key term badge exists
    const count = await keyTermBadges.count();
    expect(count).toBeGreaterThan(0);
  });

  test('has Save Draft and Publish buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
  });

  test('has Preview as Student button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Preview as Student' })).toBeVisible();
  });

  test('can change difficulty level', async ({ page }) => {
    const select = page.getByRole('combobox');
    await select.selectOption('beginner');
    await expect(select).toHaveValue('beginner');
  });

  test('shows teacher notes textarea for each section', async ({ page }) => {
    const textareas = page.getByPlaceholder('Add a note for students about this section...');
    await expect(textareas.first()).toBeVisible();
  });
});

test.describe('Teacher - Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/classes/c1/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('displays class name as heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Biology 101' })).toBeVisible();
  });

  test('shows assignment with difficulty', async ({ page }) => {
    await expect(page.getByText('intermediate')).toBeVisible();
  });

  test('displays student progress table', async ({ page }) => {
    await expect(page.getByText('Alice Johnson')).toBeVisible();
    await expect(page.getByText('Bob Smith')).toBeVisible();
  });

  test('shows progress bars and section counts', async ({ page }) => {
    await expect(page.getByText('3/3 sections')).toBeVisible();
    await expect(page.getByText('1/3 sections')).toBeVisible();
  });

  test('shows completion status badges', async ({ page }) => {
    await expect(page.getByText('completed')).toBeVisible();
    await expect(page.getByText('in progress')).toBeVisible();
  });

  test('has View responses link', async ({ page }) => {
    await expect(page.getByText('View responses')).toBeVisible();
  });

  test('has back to Classes button', async ({ page }) => {
    // Use specific selector since "Classes" appears in navbar link too
    await expect(page.getByRole('button', { name: /Classes/ })).toBeVisible();
  });
});

test.describe('Teacher - Assignment Drilldown Page', () => {
  test.beforeEach(async ({ page }) => {
    mockTeacherApiRoutes(page);
    // Mock the drilldown-specific endpoints
    await page.route('**/api/v1/dashboard/assignments/**', (route) => {
      return route.fulfill({
        json: {
          checkpoints: [
            { section_index: 0, student_text: 'I think the main topic is...', ai_feedback: 'Good observation!' },
          ],
          sowhat: { student_text: 'This paper contributes...', ai_feedback: 'Well summarized!' },
        },
      });
    });
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/drilldown');
    await page.waitForLoadState('networkidle');
  });

  test('displays heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Assignment Responses' })).toBeVisible();
  });

  test('shows Class Insights panel', async ({ page }) => {
    await expect(page.getByText('Class Insights')).toBeVisible();
  });

  test('has Generate Insights button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Generate Insights' })).toBeVisible();
  });

  test('shows student response cards', async ({ page }) => {
    await expect(page.getByText('Alice Johnson')).toBeVisible();
    await expect(page.getByText('Bob Smith')).toBeVisible();
  });

  test('has back button', async ({ page }) => {
    await expect(page.getByText('Back')).toBeVisible();
  });

  test('shows empty state when no students have started', async ({ page }) => {
    await page.route('**/api/v1/assignments/a1', (route) => {
      return route.fulfill({
        json: { id: 'a1', class_id: 'c3', paper_title: 'Test' },
      });
    });
    await page.route('**/api/v1/dashboard/classes/c3/progress', (route) => {
      return route.fulfill({ json: { students: [], assignments: [] } });
    });
    await page.goto('/teacher/assignments/a1/drilldown');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('No students have started this assignment yet.')).toBeVisible();
  });
});
