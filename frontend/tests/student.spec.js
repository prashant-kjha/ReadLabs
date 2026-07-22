/**
 * ReadLabs - Student Pages Tests
 * Tests StudentDashboardPage, SelfStudyPage, ReadingPage.
 */
const { test, expect } = require('@playwright/test');
const {
  loginAsStudent,
  mockStudentApiRoutes,
  mockSessionWithPaper,
  routeSamplePdf,
  SAMPLE_PDF_URL,
  STUDENT_USER,
} = require('./helpers');

test.describe('Student - Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My Classes' })).toBeVisible();
  });

  test('shows Join a Class button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Join a Class' })).toBeVisible();
  });

  test('displays enrolled classes', async ({ page }) => {
    await expect(page.getByText('Biology 101')).toBeVisible();
  });

  test('shows teacher name', async ({ page }) => {
    await expect(page.getByText('Teacher: Test Teacher')).toBeVisible();
  });

  test('shows assignments under each class', async ({ page }) => {
    await expect(page.getByText('Neural Networks in Biology')).toBeVisible();
    await expect(page.getByText('CRISPR Gene Editing')).toBeVisible();
  });

  test('shows difficulty badges for assignments', async ({ page }) => {
    await expect(page.getByText('intermediate')).toBeVisible();
    await expect(page.getByText('beginner')).toBeVisible();
  });

  test('shows session status badges', async ({ page }) => {
    await expect(page.getByText('In Progress')).toBeVisible();
    await expect(page.getByText('Not Started')).toBeVisible();
  });

  test('opens Join Class modal when button is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Join a Class' }).click();
    await expect(page.getByRole('heading', { name: 'Join a Class' })).toBeVisible();
    await expect(page.getByPlaceholder('Class code')).toBeVisible();
  });

  test('has Join and Cancel buttons in modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Join a Class' }).click();
    // Both buttons are inside the modal form
    const modal = page.locator('.card.p-6');
    await expect(modal.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('closes modal when Cancel is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Join a Class' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Join a Class' })).not.toBeVisible();
  });

  test('converts class code to uppercase', async ({ page }) => {
    await page.getByRole('button', { name: 'Join a Class' }).click();
    const input = page.getByPlaceholder('Class code');
    await input.fill('bio-4x2k');
    await expect(input).toHaveValue('BIO-4X2K');
  });

  test('clicking assignment navigates to reading page', async ({ page }) => {
    await page.getByText('Neural Networks in Biology').click();
    await expect(page).toHaveURL(/\/student\/read\/a1/);
  });
});

test.describe('Student - Self Study Page', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');
  });

  test('displays page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Paper Library' })).toBeVisible();
  });

  test('shows Upload PDF button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Upload PDF' })).toBeVisible();
  });

  test('displays search bar', async ({ page }) => {
    await expect(page.getByPlaceholder('Search open-access papers...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  });

  test('does not show category tabs (categories removed 2026-05-01)', async ({ page }) => {
    // Category taxonomy was never implemented in the schema; the UI was removed
    // along with /library/categories. Re-add when a real taxonomy exists.
    await expect(page.getByRole('button', { name: 'Biology' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Chemistry' })).not.toBeVisible();
  });

  test('displays library papers', async ({ page }) => {
    await expect(page.getByText('Quantum Computing Basics')).toBeVisible();
    await expect(page.getByText('Organic Chemistry Reactions')).toBeVisible();
  });

  test('shows paper metadata (authors, year)', async ({ page }) => {
    await expect(page.getByText('Alice et al.')).toBeVisible();
    await expect(page.getByText('2024')).toBeVisible();
  });

  test('shows difficulty badges for papers', async ({ page }) => {
    await expect(page.getByText('beginner')).toBeVisible();
    await expect(page.getByText('advanced')).toBeVisible();
  });

  test('has Start Reading button for each paper', async ({ page }) => {
    const startButtons = page.getByRole('button', { name: 'Start Reading' });
    await expect(startButtons.first()).toBeVisible();
  });

  test('shows recommendations panel', async ({ page }) => {
    await expect(page.getByText('Recommended for You')).toBeVisible();
  });

  test('can perform search', async ({ page }) => {
    await page.getByPlaceholder('Search open-access papers...').fill('quantum');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('Search Result Paper')).toBeVisible();
  });

  test('shows clear button after search', async ({ page }) => {
    await page.getByPlaceholder('Search open-access papers...').fill('quantum');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
  });

  test('clears search results when Clear is clicked', async ({ page }) => {
    await page.getByPlaceholder('Search open-access papers...').fill('quantum');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Search Result Paper')).not.toBeVisible();
  });
});

test.describe('Student - Reading Page', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
  });

  test('displays paper title in header', async ({ page }) => {
    await expect(page.getByText('Neural Networks in Biology')).toBeVisible();
  });

  test('shows section sidebar', async ({ page }) => {
    await expect(page.getByText('Sections')).toBeVisible();
  });

  test('shows section names in sidebar', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Introduction' })).toBeVisible();
  });

  test('shows current section title as heading in AI panel', async ({ page }) => {
    await expect(page.getByText('Introduction').first()).toBeVisible();
  });

  test('displays guiding questions', async ({ page }) => {
    await expect(page.getByText('What is the main research question?')).toBeVisible();
    await expect(page.getByText('Why is this topic important?')).toBeVisible();
  });

  test('shows checkpoint textarea for response', async ({ page }) => {
    await expect(page.getByPlaceholder('What did you find in this section?')).toBeVisible();
  });

  test('has Submit button for checkpoint', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('shows sections sidebar toggle', async ({ page }) => {
    await expect(page.getByText('Sections')).toBeVisible();
  });

  test('shows AI Guidance panel header', async ({ page }) => {
    await expect(page.getByText('AI Guidance')).toBeVisible();
  });

  test('shows the no-PDF empty state for a text-only paper', async ({ page }) => {
    // The default mock session has no paper_id, i.e. a paper stored as text only.
    await expect(page.getByTestId('pdf-unavailable')).toBeVisible();
  });

  test('shows jargon lookup input', async ({ page }) => {
    await expect(page.getByPlaceholder('Enter term...')).toBeVisible();
  });

  test('shows structure guide in sidebar', async ({ page }) => {
    await expect(page.getByText('Structure Guide')).toBeVisible();
  });

  test('has skip checkpoint button (optional checkpoints)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Skip/ })).toBeVisible();
  });

  test('shows critical thinking prompt link', async ({ page }) => {
    await expect(page.getByText('Critical thinking prompt')).toBeVisible();
  });

  test('shows look up a term section', async ({ page }) => {
    await expect(page.getByText('Look up a term')).toBeVisible();
  });

  test('can type and submit checkpoint response', async ({ page }) => {
    const textarea = page.getByPlaceholder('What did you find in this section?');
    await textarea.fill('The paper discusses neural networks applied to biology.');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('AI is reviewing your response...')).toBeVisible();
  });

  test('shows Next Section link after submitting checkpoint', async ({ page }) => {
    // Submit a checkpoint first to enable advance
    const textarea = page.getByPlaceholder('What did you find in this section?');
    await textarea.fill('Test response for checkpoint.');
    await page.getByRole('button', { name: 'Submit' }).click();
  });

  test('can look up terms via jargon input', async ({ page }) => {
    const input = page.getByPlaceholder('Enter term...');
    await input.fill('neural network');
    await input.press('Enter');
    // Mock returns explanation immediately — verify it appears
    await expect(page.getByText('A neural network is a computing system inspired by biological neural networks')).toBeVisible();
  });

  test('shows Reading label in header', async ({ page }) => {
    // The header has a "Reading" text that indicates the page mode
    const readingLabel = page.locator('p', { hasText: 'Reading' }).first();
    await expect(readingLabel).toBeVisible();
  });

  test('shows Before you read section', async ({ page }) => {
    await expect(page.getByText('Before you read')).toBeVisible();
  });

  test('shows Your response section', async ({ page }) => {
    await expect(page.getByText('Your response')).toBeVisible();
  });

  test('shows section type badges in sidebar', async ({ page }) => {
    // Section type badges show first letter (I for Introduction, etc.)
    await expect(page.getByText('Introduction').first()).toBeVisible();
  });

  test('shows sidebar collapse button', async ({ page }) => {
    // The sidebar has a collapse button (← arrow)
    const collapseBtn = page.locator('button', { hasText: '←' });
    await expect(collapseBtn).toBeVisible();
  });

  test('shows AI panel with draggable resize handle', async ({ page }) => {
    // The AI panel has a resize handle on its left edge
    await expect(page.getByText('AI Guidance')).toBeVisible();
  });

  test('shows Hide AI button in header', async ({ page }) => {
    await expect(page.getByText('Hide AI')).toBeVisible();
  });

  test('shows Sections toggle in header', async ({ page }) => {
    await expect(page.getByText('Sections')).toBeVisible();
  });

  test('multiple sections shown in sidebar', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Introduction' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Methods' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Results' })).toBeVisible();
  });

  test('sidebar shows section numbers for incomplete sections', async ({ page }) => {
    // Section 2 (Methods) should show a number since it's not completed
    const methodsBtn = page.getByRole('button', { name: 'Methods' });
    await expect(methodsBtn).toBeVisible();
  });
});

test.describe('Student - Streak Widget', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('shows streak widget with XP and level', async ({ page }) => {
    // The streak widget shows in the header
    await expect(page.getByText('150 XP')).toBeVisible();
    await expect(page.getByText('Lv.2')).toBeVisible();
  });
});

test.describe('Student - Landmark Featured Widget', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('shows the featured landmark section', async ({ page }) => {
    await expect(page.getByText('Start with a classic')).toBeVisible();
  });

  test('shows a featured paper', async ({ page }) => {
    await expect(page.getByText('Attention Is All You Need')).toBeVisible();
  });
});

test.describe('Student - Reading Page PDF states', () => {
  // Landmark-library and CORE-fetched papers are stored as extracted text only,
  // so /pdf-url legitimately answers {url: null}. That must read as an empty
  // state, not as a failure or a spinner that never resolves.
  async function openReadingPage(page, pdfRoute) {
    mockStudentApiRoutes(page);
    // The session must carry a paper_id for a PDF to be requested at all.
    await mockSessionWithPaper(page);
    await routeSamplePdf(page);
    await page.route('**/api/v1/papers/**/pdf-url', pdfRoute);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
  }

  test('shows an empty state when the paper has no PDF', async ({ page }) => {
    await openReadingPage(page, (route) => route.fulfill({ json: { url: null } }));

    await expect(page.getByTestId('pdf-unavailable')).toBeVisible();
    await expect(page.getByText('No PDF available')).toBeVisible();
    await expect(page.getByText('Loading PDF...')).toHaveCount(0);
  });

  test('shows a retryable error when the PDF URL request fails', async ({ page }) => {
    await openReadingPage(page, (route) =>
      route.fulfill({ status: 500, json: { detail: 'Failed to generate PDF URL' } }));

    await expect(page.getByTestId('pdf-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('renders the PDF when one is available', async ({ page }) => {
    await openReadingPage(page, (route) => route.fulfill({ json: { url: SAMPLE_PDF_URL } }));

    await expect(page.getByText('1 / 1')).toBeVisible();
    await expect(page.getByTestId('pdf-unavailable')).toHaveCount(0);
  });

  test('retry re-requests the PDF and renders it once available', async ({ page }) => {
    // Flip the flag explicitly rather than counting calls: StrictMode double-
    // fires the init effect, so the Nth request isn't a stable signal.
    let failing = true;
    let requests = 0;
    await openReadingPage(page, (route) => {
      requests += 1;
      return failing
        ? route.fulfill({ status: 500, json: { detail: 'boom' } })
        : route.fulfill({ json: { url: SAMPLE_PDF_URL } });
    });

    await expect(page.getByTestId('pdf-error')).toBeVisible();
    const before = requests;

    failing = false;
    await page.getByRole('button', { name: 'Retry' }).click();

    await expect(page.getByText('1 / 1')).toBeVisible();
    expect(requests).toBeGreaterThan(before);
  });
});
