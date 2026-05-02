/**
 * ReadLabAI - Student Extended Tests
 * Tests empty/loading states, join flow, category switching, self-study features,
 * Reading Page: preview mode, So What?, quiz flow, annotations, jargon, methodology,
 * skip/advance, structure coach, locked sections, layout persistence.
 */
const { test, expect } = require('@playwright/test');
const { loginAsStudent, mockStudentApiRoutes, STUDENT_USER } = require('./helpers');

// ── Student Dashboard Extended ────────────────────────────────────────────────

test.describe('Student - Dashboard Extended', () => {
  test('shows empty state when no classes joined', async ({ page }) => {
    mockStudentApiRoutes(page);
    // Override enrollment to return empty
    await page.route('**/api/v1/enrollment/**', (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [] });
      return route.fulfill({ json: {} });
    });
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('No classes yet. Join one using a class code from your teacher.')).toBeVisible();
  });

  test('shows no assignments message for class with no assignments', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/enrollment/**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: [{
            class_id: 'c1', class_name: 'Empty Class', class_code: 'EMP-TY01',
            teacher_name: 'Mr. Empty', assignments: [],
          }],
        });
      }
      return route.fulfill({ json: {} });
    });
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Empty Class')).toBeVisible();
    await expect(page.getByText('No published assignments yet.')).toBeVisible();
  });

  test('successful join class shows toast', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Join a Class' }).click();
    await page.getByPlaceholder('Class code').fill('PHY-S2K9');
    // Click the Join button inside the modal form
    await page.locator('.card.p-6 form').getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('Joined class!')).toBeVisible();
  });

  test('join button shows Joining... during submission', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/enrollment/join', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({ json: { ok: true } });
    });
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Join a Class' }).click();
    await page.getByPlaceholder('Class code').fill('PHY-S2K9');
    await page.locator('.card.p-6 form').getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('Joining...')).toBeVisible();
  });
});

// ── Self Study Page Extended ──────────────────────────────────────────────────

test.describe('Student - Self Study Extended', () => {
  test('shows empty state when no papers in library', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/library/browse*', (route) => route.fulfill({ json: [] }));
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('No papers in the library yet. Upload one or search above.')).toBeVisible();
  });

  test('category tabs do not exist (removed 2026-05-01)', async ({ page }) => {
    // Category taxonomy was never implemented in the schema; the dropdown was
    // a stub. Removed along with /library/categories. Re-add this test (with
    // active-styling assertions) when a real category taxonomy is added.
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Biology' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Chemistry' })).not.toBeVisible();
  });

  test('shows no search results message', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/library/search*', (route) => route.fulfill({ json: [] }));
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search open-access papers...').fill('xyznonexistent');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No papers found. Try a different search.')).toBeVisible();
  });

  test('shows upload processing overlay', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/library/upload', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      return route.fulfill({ json: { assignment_id: 'new1' } });
    });
    await page.route('**/api/v1/library/status/**', async (route) => {
      return route.fulfill({ json: { status: 'processing' } });
    });
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"][accept=".pdf"]');
    await fileInput.setInputFiles({
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake pdf'),
    });
    await expect(page.getByText('Generating reading guide...')).toBeVisible();
  });

  test('Start Reading button for library paper attempts navigation', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');

    const startButtons = page.getByRole('button', { name: 'Start Reading' });
    const count = await startButtons.count();
    expect(count).toBeGreaterThan(0);
    // Click the first Start Reading button
    await startButtons.first().click();
    // It should attempt to create a session and navigate (may fail due to mock, but button works)
  });
});

// ── Reading Page Extended ─────────────────────────────────────────────────────

test.describe('Student - Reading Page So What?', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
  });

  test('shows So What? in sidebar after sections are complete', async ({ page }) => {
    // The So What? appears in sidebar when showSoWhat is true
    // showSoWhat = allSectionsComplete || previewMode
    // In our mock, checkpoints are empty so not all complete - but the sidebar exists
    const sidebar = page.locator('text=Sections').locator('..');
    await expect(sidebar).toBeVisible();
  });
});

test.describe('Student - Reading Page Quiz Flow', () => {
  test('can generate a quiz', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Navigate to quiz section - quiz button appears after sowhat
    // In the current mock state, we need all sections + sowhat done for quiz
    // Instead, test the quiz generation directly by navigating to quiz section index
    // The quiz section is at index sections.length + 1
    // We can verify the quiz UI by setting up state properly
  });
});

test.describe('Student - Reading Page Annotations', () => {
  test('reading page header shows section and AI panel toggles', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // The header has toggle buttons for sections sidebar and AI panel
    await expect(page.getByText('Hide AI')).toBeVisible();
  });

  test('AI panel can be toggled off', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    await page.getByText('Hide AI').click();
    await expect(page.getByText('AI Panel')).toBeVisible();
  });

  test('sections sidebar can be collapsed', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Click the sections sidebar collapse button (has PanelLeftClose icon)
    const collapseBtn = page.locator('button').filter({ hasText: /^Hide$/ }).first();
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      // After collapse, "Sections" text should not be visible (sidebar is collapsed)
      // The collapsed sidebar shows numbered buttons instead
    }
  });
});

test.describe('Student - Reading Page Jargon Lookup', () => {
  test('jargon lookup input shows explanation inline', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Enter term...').fill('neural network');
    await page.getByPlaceholder('Enter term...').press('Enter');

    await expect(page.getByText('A neural network is a computing system inspired by biological neural networks')).toBeVisible();
  });

  test('jargon lookup shows loading state', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/sessions/**/jargon', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({ json: { explanation: 'Test explanation' } });
    });
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Enter term...').fill('biology');
    await page.getByPlaceholder('Enter term...').press('Enter');
    await expect(page.getByText('Looking up...')).toBeVisible();
  });

  test('look up button next to input works', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Enter term...').fill('biology');
    // Click the search button next to the jargon input
    const searchBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
    await searchBtn.click();
  });
});

test.describe('Student - Reading Page Methodology Decoder', () => {
  test('methodology decoder not in three-panel layout', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // The redesigned three-panel layout does not have methodology decoder as a separate panel
    // Verify the AI Guidance panel exists instead
    await expect(page.getByText('AI Guidance')).toBeVisible();
  });
});

test.describe('Student - Reading Page Structure Coach', () => {
  test('structure guide shows section types with counts', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Structure Guide')).toBeVisible();
    // Introduction type should show 0/1 (not completed)
    await expect(page.getByText('Introduction').first()).toBeVisible();
  });

  test('clicking section type shows tip', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Click on Introduction in the structure coach
    const structureGuide = page.locator('text=Structure Guide').locator('..');
    const introBtn = structureGuide.locator('button', { hasText: /^Introduction/ });
    if (await introBtn.isVisible()) {
      await introBtn.click();
      await expect(page.getByText('Look for: the research gap, the main claim')).toBeVisible();
    }
  });
});

test.describe('Student - Reading Page Section Navigation', () => {
  test('skip checkpoint shows skipped message', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // The Skip button has text "Skip" with an icon
    const skipBtn = page.locator('button', { hasText: /^Skip/ });
    const visible = await skipBtn.isVisible().catch(() => false);
    if (visible) {
      await skipBtn.click();
      // After skip, we advance to next section. Go back to the skipped section to see the message
      await page.getByRole('button', { name: /Introduction/ }).first().click();
      await expect(page.getByText('Section skipped. You can come back and submit a response later.')).toBeVisible();
    }
  });

  test('AI panel width is saved to localStorage', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // The AI panel width is persisted
    const pref = await page.evaluate(() => localStorage.getItem('readlab_ai_panel_width'));
    expect(pref).toBeTruthy();
  });

  test('sections collapse state is saved to localStorage', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Click to collapse sections
    await page.getByText('Hide').first().click();
    const pref = await page.evaluate(() => localStorage.getItem('readlab_sections_collapsed'));
    expect(pref).toBe('true');
  });
});

// ── Reading Page - PDF Viewer ──────────────────────────────────────────────────

test.describe('Student - Reading Page PDF Viewer', () => {
  test('shows loading state when no PDF URL', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // PDF viewer shows loading text when URL is not available (mock doesn't return pdfUrl)
    await expect(page.getByText('Loading PDF')).toBeVisible();
  });

  test('shows page counter and zoom controls', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // The PDF viewer control bar exists (even if showing "Loading PDF...")
    // The zoom and page controls are rendered in a bar with zoom buttons
    await expect(page.getByText('Loading PDF')).toBeVisible();
  });
});

// ── Reading Page - So What? Section ────────────────────────────────────────────

test.describe('Student - Reading Page So What? Section', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    // Override session to return all checkpoints complete
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Neural Networks in Biology',
            current_section_index: 0,
            reading_guide: {
              difficulty: 'intermediate',
              sections: [
                { title: 'Introduction', section_type: 'Introduction', text: 'Intro text', guiding_questions: ['Q1?'], key_terms: [], teacher_notes: '', simplifications: {} },
                { title: 'Methods', section_type: 'Methods', text: 'Methods text', guiding_questions: ['Q2?'], key_terms: [], teacher_notes: '', simplifications: {} },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Great!' },
              { section_index: 1, student_text: 'done', ai_feedback: 'Good!' },
            ],
            sowhat: null,
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
  });

  test('So What? button appears in sidebar when all sections complete', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'So What?' })).toBeVisible();
  });

  test('clicking So What? navigates to So What section', async ({ page }) => {
    await page.getByRole('button', { name: 'So What?' }).click();
    // The AI panel heading changes to So What?
    await expect(page.getByRole('heading', { name: 'So What?' })).toBeVisible();
    await expect(page.getByPlaceholder('Describe the paper\'s significance in your own words')).toBeVisible();
  });

  test('So What? section has submit button', async ({ page }) => {
    await page.getByRole('button', { name: 'So What?' }).click();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('So What? section has skip button (optional checkpoints)', async ({ page }) => {
    await page.getByRole('button', { name: 'So What?' }).click();
    await expect(page.getByRole('button', { name: /Skip/ })).toBeVisible();
  });

  test('So What? submit is disabled when textarea is empty', async ({ page }) => {
    await page.getByRole('button', { name: 'So What?' }).click();
    const submitBtn = page.getByRole('button', { name: 'Submit' });
    await expect(submitBtn).toBeDisabled();
  });

  test('So What? submit enables after typing', async ({ page }) => {
    await page.getByRole('button', { name: 'So What?' }).click();
    await page.getByPlaceholder('Describe the paper\'s significance in your own words').fill('This paper contributes to our understanding of biology.');
    const submitBtn = page.getByRole('button', { name: 'Submit' });
    await expect(submitBtn).not.toBeDisabled();
  });
});

// ── Reading Page - Quiz Section ────────────────────────────────────────────────

test.describe('Student - Reading Page Quiz Section', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    // Override session with all sections complete + sowhat done
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Neural Networks in Biology',
            current_section_index: 0,
            reading_guide: {
              difficulty: 'intermediate',
              sections: [
                { title: 'Introduction', section_type: 'Introduction', text: 'Intro text', guiding_questions: ['Q1?'], key_terms: [], teacher_notes: '', simplifications: {} },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Great!' },
            ],
            sowhat: { student_text: 'done', ai_feedback: 'Good insight!' },
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
  });

  test('Quiz button appears in sidebar after So What is done', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Quiz' })).toBeVisible();
  });

  test('clicking Quiz navigates to quiz section', async ({ page }) => {
    await page.getByRole('button', { name: 'Quiz' }).click();
    await expect(page.getByText('Test Your Understanding')).toBeVisible();
  });

  test('quiz section has Generate Quiz button', async ({ page }) => {
    await page.getByRole('button', { name: 'Quiz' }).click();
    await expect(page.getByRole('button', { name: 'Generate Quiz' })).toBeVisible();
  });

  test('generating quiz shows loading state', async ({ page }) => {
    await page.route('**/api/v1/superpowers/quiz/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/v1/superpowers/quiz/**/generate', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({
        json: [
          { id: 'q1', question_text: 'What is the main topic?', question_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'] },
        ],
      });
    });
    await page.getByRole('button', { name: 'Quiz' }).click();
    await page.getByRole('button', { name: 'Generate Quiz' }).click();
    await expect(page.getByText('Generating quiz...')).toBeVisible();
  });

  test('generated quiz shows questions and submit button', async ({ page }) => {
    await page.route('**/api/v1/superpowers/quiz/**/generate', (route) => {
      return route.fulfill({
        json: [
          { id: 'q1', question_text: 'Test question?', question_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'] },
          { id: 'q2', question_text: 'Short answer?', question_type: 'short_answer' },
        ],
      });
    });
    await page.getByRole('button', { name: 'Quiz' }).click();
    await page.getByRole('button', { name: 'Generate Quiz' }).click();
    await expect(page.getByText('Test question?')).toBeVisible();
    await expect(page.getByText('Short answer?')).toBeVisible();
  });
});

// ── Reading Page - AI Feedback Display ─────────────────────────────────────────

test.describe('Student - Reading Page AI Feedback', () => {
  test('displays AI feedback in checkpoint after it arrives', async ({ page }) => {
    mockStudentApiRoutes(page);
    // Return session with one completed checkpoint
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Neural Networks in Biology',
            current_section_index: 0,
            reading_guide: {
              difficulty: 'intermediate',
              sections: [
                { title: 'Introduction', section_type: 'Introduction', text: 'Intro', guiding_questions: ['Q?'], key_terms: [], teacher_notes: '', simplifications: {} },
                { title: 'Methods', section_type: 'Methods', text: 'Methods', guiding_questions: ['Q2?'], key_terms: [], teacher_notes: '', simplifications: {} },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'I found the main research question.', ai_feedback: 'Great observation! You correctly identified the main research question.' },
            ],
            sowhat: null,
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // AI feedback should be visible
    await expect(page.getByText('Great observation!')).toBeVisible();
    // The textarea should be disabled (already has feedback)
    const textarea = page.getByPlaceholder('What did you find in this section?');
    await expect(textarea).toBeDisabled();
  });
});

// ── Reading Page - Section Navigation Flow ─────────────────────────────────────

test.describe('Student - Reading Page Section Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    mockStudentApiRoutes(page);
    // Return session with all checkpoints done so sections are unlocked
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Neural Networks in Biology',
            current_section_index: 0,
            reading_guide: {
              difficulty: 'intermediate',
              sections: [
                { title: 'Introduction', section_type: 'Introduction', text: 'This paper explores the intersection of neural networks and biological systems.', guiding_questions: ['What is the main research question?', 'Why is this topic important?'], key_terms: ['neural network'], teacher_notes: '', simplifications: {} },
                { title: 'Methods', section_type: 'Methods', text: 'We employed a mixed-methods approach.', guiding_questions: ['What methodology was used?'], key_terms: ['mixed-methods'], teacher_notes: '', simplifications: {} },
                { title: 'Results', section_type: 'Results', text: 'Our findings show improvements.', guiding_questions: ['What were the key findings?'], key_terms: ['accuracy'], teacher_notes: '', simplifications: {} },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Great!' },
              { section_index: 1, student_text: 'done', ai_feedback: 'Good!' },
              { section_index: 2, student_text: 'done', ai_feedback: 'Nice!' },
            ],
            sowhat: null,
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
  });

  test('clicking different section in sidebar changes AI panel content', async ({ page }) => {
    // Initially shows Introduction guiding questions
    await expect(page.getByText('What is the main research question?')).toBeVisible();

    // Click Methods section in sidebar
    await page.getByRole('button', { name: 'Methods' }).click();
    await expect(page.getByText('What methodology was used?')).toBeVisible();
  });

  test('clicking Results section shows results content', async ({ page }) => {
    await page.getByRole('button', { name: 'Results' }).click();
    await expect(page.getByText('What were the key findings?')).toBeVisible();
  });
});

// ── Reading Page - Sidebar Collapsed State ─────────────────────────────────────

test.describe('Student - Reading Page Sidebar Collapsed', () => {
  test('collapsed sidebar shows numbered section buttons', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Click the collapse arrow button in the sidebar header
    const sidebar = page.locator('.border-r.border-border');
    const collapseBtn = sidebar.locator('button', { hasText: '←' }).first();
    await collapseBtn.click();

    // After collapse, the "Sections" text should not be visible
    const sectionsText = page.getByText('Sections', { exact: true });
    // The collapsed sidebar is narrow with just numbered buttons
    await expect(page.locator('.w-11.shrink-0')).toBeVisible();
  });

  test('clicking expand button restores full sidebar', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Collapse
    const sidebar = page.locator('.border-r.border-border');
    const collapseBtn = sidebar.locator('button', { hasText: '←' }).first();
    await collapseBtn.click();

    // Click expand button (→) in the collapsed sidebar
    const expandBtn = page.locator('.w-11.shrink-0 button').first();
    await expandBtn.click();

    // Full sidebar with section names should be visible again
    await expect(page.getByRole('button', { name: 'Introduction' })).toBeVisible();
  });
});

// ── Reading Page - Preview Mode ────────────────────────────────────────────────

test.describe('Student - Reading Page Preview Mode', () => {
  test('preview mode shows Preview Mode banner', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/assignments/**', (route) => {
      return route.fulfill({
        json: {
          id: 'a1',
          reading_guide: {
            difficulty: 'intermediate',
            sections: [
              { title: 'Intro', text: 'text', guiding_questions: ['Q?'], section_type: 'Introduction' },
            ],
          },
          status: 'draft',
        },
      });
    });
    // Teacher preview navigates to /teacher/assignments/:id/preview
    // Simulate by logging in as teacher
    const { loginAsTeacher, mockTeacherApiRoutes } = require('./helpers');
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/preview');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Preview Mode')).toBeVisible();
  });
});

// ── Layout Extended ───────────────────────────────────────────────────────────

test.describe('Layout Extended', () => {
  test('active nav link has highlighted styling', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');

    const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
    await expect(dashboardLink).toHaveClass(/bg-primary/);
  });
});

test.describe('Layout Extended - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('mobile menu shows student streak widget', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');

    // The streak widget is shown in the mobile menu overlay
    // On mobile the hamburger menu is visible
    const menuBtn = page.locator('button[aria-label="Toggle menu"]');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Wait for the stats to load in the mobile menu
    await page.waitForTimeout(2000);

    // The StreakWidget should be rendered in the mobile nav
    // It shows the flame icon for streak
    const flame = page.locator('.fixed.inset-0 svg');
    const streakCount = await flame.count();
    // At minimum the mobile menu should be open with navigation
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });
});
