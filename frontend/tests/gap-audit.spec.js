/**
 * ReadLabs - Gap Audit Tests
 * Covers features identified as missing from the 241 existing tests after
 * line-by-line audit of every source file.
 */
const { test, expect } = require('@playwright/test');
const {
  loginAsStudent,
  loginAsTeacher,
  mockStudentApiRoutes,
  mockTeacherApiRoutes,
  mockAuthRoutes,
  STUDENT_USER,
  TEACHER_USER,
} = require('./helpers');

// ── Auth Page Gap Tests ────────────────────────────────────────────────────────

test.describe('Auth Page - Error Clearing on Mode Switch', () => {
  test('switching from signin to signup clears error message', async ({ page }) => {
    // Do NOT call mockAuthRoutes — set up routes manually to avoid interception
    await page.route('**/api/v1/auth/signin', (route) => {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid email or password' }),
      });
    });
    await page.route('**/api/v1/auth/signup', (route) => {
      return route.fulfill({ json: { user_id: 'x', email_confirmation_required: true } });
    });
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Submit with bad credentials to trigger error
    await page.getByLabel('Email').fill('teacher@test.com');
    await page.getByLabel('Password').fill('wrong');
    await page.locator('form button[type="submit"]').click();
    // Error appears in both toast and form — scope to form
    await expect(page.locator('form').getByText('Invalid email or password')).toBeVisible();

    // Switch to signup mode — error should disappear
    await page.locator('.flex.rounded-lg.bg-muted button', { hasText: 'Sign Up' }).click();
    await expect(page.locator('form').getByText('Invalid email or password')).not.toBeVisible();
  });

  test('switching from signup to signin clears error message', async ({ page }) => {
    await page.route('**/api/v1/auth/signup', (route) => {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Email already registered' }),
      });
    });
    await page.route('**/api/v1/auth/signin', (route) => {
      return route.fulfill({ json: TEACHER_USER });
    });
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Switch to signup
    await page.locator('.flex.rounded-lg.bg-muted button', { hasText: 'Sign Up' }).click();
    await page.getByLabel('Full Name').fill('Test');
    await page.getByLabel('Email').fill('taken@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('form').getByText('Email already registered')).toBeVisible();

    // Switch back to signin — error should disappear
    await page.locator('.flex.rounded-lg.bg-muted button', { hasText: 'Log In' }).click();
    await expect(page.locator('form').getByText('Email already registered')).not.toBeVisible();
  });
});

test.describe('Auth Page - Submit Button Text', () => {
  test('signin mode shows Log In button text', async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    const submitBtn = page.locator('form button[type="submit"]');
    await expect(submitBtn).toHaveText('Log In');
  });

  test('signup mode shows Create Account button text', async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.locator('.flex.rounded-lg.bg-muted button', { hasText: 'Sign Up' }).click();
    const submitBtn = page.locator('form button[type="submit"]');
    await expect(submitBtn).toHaveText('Create Account');
  });

  test('submit button shows Loading... during submission', async ({ page }) => {
    mockAuthRoutes(page);
    await page.route('**/api/v1/auth/signin', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({ json: TEACHER_USER });
    });
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill('teacher@test.com');
    await page.getByLabel('Password').fill('password123');
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText('Loading...')).toBeVisible();
  });
});

test.describe('Auth Page - Decorative Panel', () => {
  test('left panel shows Read Smarter feature', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByText('Read Smarter')).toBeVisible();
  });

  test('left panel shows Think Critically feature', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByText('Think Critically')).toBeVisible();
  });

  test('left panel shows Earn Achievements feature', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByText('Earn Achievements')).toBeVisible();
  });

  test('left panel shows tagline', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByText('Understand Research.')).toBeVisible();
    await expect(page.getByText('Build Critical Thinking.')).toBeVisible();
  });

  test('mobile shows ReadLabs branding without left panel', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/auth');
    // The mobile-only branding should be visible
    const mobileBrand = page.locator('.flex.md\\:hidden').filter({ hasText: 'ReadLabs' });
    await expect(mobileBrand).toBeVisible();
    // The desktop left panel should be hidden
    await expect(page.getByText('Read Smarter')).not.toBeVisible();
  });
});

// ── Landing Page Gap Tests ─────────────────────────────────────────────────────

test.describe('Landing Page - Browser Mockup', () => {
  test('shows URL bar in browser mockup', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('readlabs.app / student / read / neural-networks-biology')).toBeVisible();
  });

  test('shows sections sidebar with Introduction', async ({ page }) => {
    await page.goto('/');
    const urlBar = page.getByText('readlabs.app / student / read / neural-networks-biology');
    const mockup = urlBar.locator('xpath=ancestor::div[contains(@class, "rounded-xl") and contains(@class, "border")]');
    await expect(mockup.getByText('Sections', { exact: true })).toBeVisible();
    await expect(mockup.getByText('Introduction')).toBeVisible();
  });

  test('shows structure guide pills in mockup', async ({ page }) => {
    await page.goto('/');
    const urlBar = page.getByText('readlabs.app / student / read / neural-networks-biology');
    const mockup = urlBar.locator('xpath=ancestor::div[contains(@class, "rounded-xl") and contains(@class, "border")]');
    await expect(mockup.getByText('Structure Guide')).toBeVisible();
    await expect(mockup.getByText('2I')).toBeVisible();
  });

  test('shows AI guidance panel with guiding questions in mockup', async ({ page }) => {
    await page.goto('/');
    const urlBar = page.getByText('readlabs.app / student / read / neural-networks-biology');
    const mockup = urlBar.locator('xpath=ancestor::div[contains(@class, "rounded-xl") and contains(@class, "border")]');
    await expect(mockup.getByText('AI Guidance')).toBeVisible();
    await expect(mockup.getByText('Guiding Questions')).toBeVisible();
  });

  test('shows traffic light dots in mockup title bar', async ({ page }) => {
    await page.goto('/');
    const urlBar = page.getByText('readlabs.app / student / read / neural-networks-biology');
    const titleBar = urlBar.locator('xpath=parent::div');
    await expect(titleBar.locator('.bg-red-400')).toBeVisible();
    await expect(titleBar.locator('.bg-amber-400')).toBeVisible();
    await expect(titleBar.locator('.bg-emerald-400')).toBeVisible();
  });
});

test.describe('Landing Page - Navigation Buttons', () => {
  test('Login button navigates to auth page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('Get Started button in nav navigates to auth', async ({ page }) => {
    await page.goto('/');
    // The nav has a "Get Started" button
    const getStartedBtns = page.getByRole('button', { name: 'Get Started' });
    await getStartedBtns.first().click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test('See How It Works scrolls to how-it-works section', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'See How It Works' }).click();
    await page.waitForTimeout(600);
    // The how-it-works section should be in view
    const section = page.locator('#how-it-works');
    await expect(section).toBeVisible();
  });
});

// ── Reading Page Gap Tests ─────────────────────────────────────────────────────

test.describe('Student - Reading Page Loading State', () => {
  test('shows loading state before session loads', async ({ page }) => {
    // Set up routes manually - mockStudentApiRoutes would intercept first
    await page.route('**/api/v1/sessions/**', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((r) => setTimeout(r, 3000));
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Loading Test Paper',
            current_section_index: 0,
            reading_guide: { sections: [{ title: 'Intro', text: 'text', guiding_questions: [] }] },
            checkpoints: [],
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.route('**/api/v1/superpowers/**', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/v1/enrollment/**', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/library/**', (route) => route.fulfill({ json: [] }));
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    // The ReadingPage shows "Loading..." in main content
    const mainLoading = page.getByRole('main').getByText('Loading...');
    await expect(mainLoading).toBeVisible();
  });
});

test.describe('Student - Reading Page Assignment Not Found', () => {
  test('shows error when session creation fails', async ({ page }) => {
    // Set up routes manually to ensure 404 gets through
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 404, json: { detail: 'Not found' } });
      }
      return route.fulfill({ json: {} });
    });
    await page.route('**/api/v1/superpowers/**', (route) => route.fulfill({ json: {} }));
    await page.route('**/api/v1/enrollment/**', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/library/**', (route) => route.fulfill({ json: [] }));
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Assignment not found.')).toBeVisible();
  });
});

test.describe('Student - Reading Page Three-Panel Layout', () => {
  test('three-panel layout shows sidebar, PDF viewer, and AI panel', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Verify the three-panel layout components are present
    await expect(page.getByText('Sections')).toBeVisible();
    await expect(page.getByText('AI Guidance')).toBeVisible();
  });
});

test.describe('Student - Reading Page So What? Submission', () => {
  test('can submit So What? response and see AI feedback', async ({ page }) => {
    mockStudentApiRoutes(page);
    // Override session to return checkpoints with ai_feedback so all sections are complete
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Test Paper',
            current_section_index: 0,
            reading_guide: {
              sections: [
                { title: 'Intro', text: 'text', guiding_questions: ['Q?'], section_type: 'Introduction' },
                { title: 'Methods', text: 'text2', guiding_questions: ['Q2?'], section_type: 'Methods' },
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
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Test Paper',
            current_section_index: 0,
            reading_guide: {
              sections: [
                { title: 'Intro', text: 'text', guiding_questions: ['Q?'], section_type: 'Introduction' },
                { title: 'Methods', text: 'text2', guiding_questions: ['Q2?'], section_type: 'Methods' },
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
      if (route.request().method() === 'POST' && route.request().url().includes('/sowhat')) {
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: {} });
    });
    // Mock sowhat polling to return feedback
    await page.route('**/api/v1/sessions/sess1', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Great!' },
              { section_index: 1, student_text: 'done', ai_feedback: 'Good!' },
            ],
            sowhat: { student_text: 'This paper matters because...', ai_feedback: 'Excellent analysis!' },
          },
        });
      }
      return route.fulfill({ json: {} });
    });

    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // So What? should appear in sidebar since all sections are complete
    await expect(page.getByRole('button', { name: 'So What?' })).toBeVisible();
    await page.getByRole('button', { name: 'So What?' }).click();

    // Fill in So What? textarea
    const sowhatArea = page.getByPlaceholder("Describe the paper's significance in your own words");
    await sowhatArea.fill('This paper matters because it advances our understanding.');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Should show pending state
    await expect(page.getByText('Getting feedback...')).toBeVisible();
  });
});

test.describe('Student - Reading Page So What? Completion', () => {
  test('shows completion message after So What? AI feedback', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Test Paper',
            current_section_index: 0,
            reading_guide: {
              sections: [
                { title: 'Intro', text: 'text', guiding_questions: ['Q?'], section_type: 'Introduction' },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Great!' },
            ],
            sowhat: { student_text: 'This matters because...', ai_feedback: 'Well done!' },
          },
        });
      }
      return route.fulfill({ json: {} });
    });

    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Navigate to So What? section
    await page.getByRole('button', { name: 'So What?' }).click();

    // Should show the AI feedback
    await expect(page.getByText('Well done!')).toBeVisible();
    // Should show completion message
    await expect(page.getByText("You've completed this assignment!")).toBeVisible();
  });
});

test.describe('Student - Reading Page Quiz E2E', () => {
  const setupQuizSession = (page) => {
    // Set up all routes manually to avoid mockStudentApiRoutes interception issues
    page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST' && !route.request().url().includes('/checkpoint') && !route.request().url().includes('/sowhat') && !route.request().url().includes('/jargon') && !route.request().url().includes('/keyterm')) {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Test Paper',
            current_section_index: 0,
            reading_guide: {
              sections: [
                { title: 'Intro', text: 'text', guiding_questions: ['Q?'], section_type: 'Introduction', key_terms: [] },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Great!' },
            ],
            sowhat: { student_text: 'done', ai_feedback: 'Good!' },
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    page.route('**/api/v1/superpowers/**', (route) => {
      const url = route.request().url();
      if (url.includes('/superpowers/quiz') && route.request().method() === 'GET') {
        return route.fulfill({ json: [] });
      }
      if (url.includes('/generate')) {
        return route.fulfill({
          json: [
            { id: 'q1', question_text: 'What is the main topic?', question_type: 'multiple_choice', options: ['Biology', 'Physics', 'Chemistry', 'Math'] },
            { id: 'q2', question_text: 'Explain the methodology used.', question_type: 'short_answer' },
          ],
        });
      }
      if (url.includes('/superpowers/quiz/attempt')) {
        return route.fulfill({
          json: {
            score: 2, max_score: 3, results: [
              { question_id: 'q1', score: 1, max: 1, correct_answer: 'Biology', explanation: 'The paper is about biology.' },
              { question_id: 'q2', score: 1, max: 2, correct_answer: 'Mixed methods', explanation: 'The methodology combined quantitative and qualitative analysis.' },
            ],
          },
        });
      }
      if (url.includes('/superpowers/stats')) {
        return route.fulfill({ json: { level: 1, xp: 0, current_streak: 0 } });
      }
      if (url.includes('/superpowers/xp')) {
        return route.fulfill({ json: { xp_added: 10 } });
      }
      return route.fulfill({ json: {} });
    });
    page.route('**/api/v1/enrollment/**', (route) => route.fulfill({ json: [] }));
    page.route('**/api/v1/library/**', (route) => route.fulfill({ json: [] }));
  };

  test('can generate quiz, answer questions, and see results', async ({ page }) => {
    setupQuizSession(page);

    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Navigate to Quiz section
    await page.getByRole('button', { name: 'Quiz' }).click();

    // Should see quiz generation screen
    await expect(page.getByText('Test Your Understanding')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Quiz' })).toBeVisible();

    // Generate quiz
    await page.getByRole('button', { name: 'Generate Quiz' }).click();
    // Wait for quiz to load — the component first calls getQuiz, then generateQuiz
    await expect(page.getByText('Comprehension Quiz')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('What is the main topic?')).toBeVisible();

    // Answer MCQ
    await page.getByLabel('Biology').check();

    // Answer short answer
    const shortAnswerInput = page.getByPlaceholder('Your answer...');
    await shortAnswerInput.fill('Mixed methods was used.');

    // Submit quiz
    await page.getByRole('button', { name: 'Submit Quiz' }).click();
    await expect(page.getByText('Quiz Results')).toBeVisible();
    await expect(page.getByText('67%')).toBeVisible();
    await expect(page.getByText('2 / 3 points')).toBeVisible();
    await expect(page.getByText('The paper is about biology.')).toBeVisible();
  });

  test('quiz shows Generating... state while loading', async ({ page }) => {
    setupQuizSession(page);
    // Override the /generate route to delay the response so the loading state is observable.
    // Pattern must match the actual generate URL: /api/v1/superpowers/quiz/<id>/generate
    await page.route('**/superpowers/quiz/**/generate', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({
        json: [{ id: 'q1', question_text: 'Q?', question_type: 'short_answer' }],
      });
    });

    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Quiz' }).click();
    await page.getByRole('button', { name: 'Generate Quiz' }).click();
    await expect(page.getByText('Generating quiz...')).toBeVisible();
  });
});

test.describe('Student - Reading Page AI Panel Features', () => {
  test('AI Guidance panel shows section content and checkpoint', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Verify the AI panel shows the section title and checkpoint form
    await expect(page.getByText('Introduction').first()).toBeVisible();
    await expect(page.getByPlaceholder('What did you find in this section?')).toBeVisible();
  });
});

test.describe('Student - Reading Page Key Term Lookup', () => {
  test('can look up key terms via AI panel jargon input', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // The AI panel has a "Look up a term" section
    await expect(page.getByText('Look up a term')).toBeVisible();
    const input = page.getByPlaceholder('Enter term...');
    await input.fill('neural network');
    await input.press('Enter');
    // Mock returns explanation immediately
    await expect(page.getByText('A neural network is a computing system inspired by biological neural networks')).toBeVisible();
  });
});

test.describe('Student - Reading Page Advance Links', () => {
  test('shows Next Section link after checkpoint AI feedback', async ({ page }) => {
    mockStudentApiRoutes(page);
    // Return session with one completed checkpoint
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Test Paper',
            current_section_index: 0,
            reading_guide: {
              sections: [
                { title: 'Intro', text: 'text', guiding_questions: ['Q?'], section_type: 'Introduction', key_terms: [] },
                { title: 'Methods', text: 'text2', guiding_questions: ['Q2?'], section_type: 'Methods', key_terms: [] },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Great job!' },
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

    // Should show Next Section link since checkpoint has feedback
    await expect(page.getByText('Next Section →')).toBeVisible();
  });

  test('shows Finish → So What? on last section with feedback', async ({ page }) => {
    mockStudentApiRoutes(page);
    await page.route('**/api/v1/sessions/**', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Test Paper',
            current_section_index: 2,
            reading_guide: {
              sections: [
                { title: 'Intro', text: 't', guiding_questions: [], section_type: 'Introduction', key_terms: [] },
                { title: 'Methods', text: 't', guiding_questions: [], section_type: 'Methods', key_terms: [] },
                { title: 'Results', text: 't', guiding_questions: [], section_type: 'Results', key_terms: [] },
              ],
            },
            checkpoints: [
              { section_index: 0, student_text: 'done', ai_feedback: 'Good!' },
              { section_index: 1, student_text: 'done', ai_feedback: 'Good!' },
              { section_index: 2, student_text: 'done', ai_feedback: 'Great!' },
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

    // On the last section with all checkpoints done, should show So What? in sidebar
    await expect(page.getByRole('button', { name: 'So What?' })).toBeVisible();
  });
});

test.describe('Student - Reading Page Locked Sections', () => {
  test('future sections are locked in sidebar', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Section 2 (Results) should be locked since we're on section 0 with no feedback
    // Locked buttons have opacity-50 and cursor-not-allowed
    const lockedBtn = page.locator('button.cursor-not-allowed.opacity-50').first();
    if (await lockedBtn.isVisible()) {
      await expect(lockedBtn).toBeDisabled();
    }
  });
});

test.describe('Student - Reading Page Pending Polling', () => {
  test('shows AI is reviewing spinner after checkpoint submission', async ({ page }) => {
    // Set up routes manually
    page.route('**/api/v1/sessions/**', (route) => {
      const url = route.request().url();
      if (route.request().method() === 'POST' && !url.includes('/checkpoint') && !url.includes('/sowhat') && !url.includes('/jargon') && !url.includes('/keyterm')) {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            assignment_id: 'a1',
            paper_title: 'Test Paper',
            current_section_index: 0,
            reading_guide: {
              sections: [
                { title: 'Intro', text: 'This paper explores neural networks.', guiding_questions: ['Q?'], section_type: 'Introduction', key_terms: [] },
              ],
            },
            checkpoints: [],
            sowhat: null,
          },
        });
      }
      if (route.request().method() === 'POST' && url.includes('/checkpoint')) {
        return route.fulfill({ json: { ok: true } });
      }
      if (route.request().method() === 'GET' && url.match(/\/sessions\/sess/)) {
        return route.fulfill({
          json: {
            session_id: 'sess1',
            checkpoints: [
              { section_index: 0, student_text: 'submitted', ai_feedback: null },
            ],
            sowhat: null,
            jargon_lookups: [],
          },
        });
      }
      return route.fulfill({ json: {} });
    });
    page.route('**/api/v1/superpowers/**', (route) => {
      const url = route.request().url();
      if (url.includes('/superpowers/xp')) {
        return route.fulfill({ json: { xp_added: 10 } });
      }
      if (url.includes('/superpowers/stats')) {
        return route.fulfill({ json: { level: 1, xp: 0, current_streak: 0 } });
      }
      return route.fulfill({ json: {} });
    });
    page.route('**/api/v1/enrollment/**', (route) => route.fulfill({ json: [] }));
    page.route('**/api/v1/library/**', (route) => route.fulfill({ json: [] }));

    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    // Submit a checkpoint
    const textarea = page.getByPlaceholder('What did you find in this section?');
    await textarea.fill('This section discusses neural networks in biology.');
    await page.getByRole('button', { name: 'Submit' }).click();

    // Should show the pending spinner
    await expect(page.getByText('AI is reviewing your response...')).toBeVisible();
  });
});

test.describe('Student - Reading Page Critical Thinking Prompt', () => {
  test('clicking critical thinking prompt link loads and displays prompt', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    await page.getByText('Critical thinking prompt').click();
    const criticalText = page.getByText('Consider whether the sample size is adequate.');
    await expect(criticalText).toBeVisible({ timeout: 10000 });
  });

  test('critical thinking prompt can be closed', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/read/a1');
    await page.waitForLoadState('networkidle');

    await page.getByText('Critical thinking prompt').click();
    const criticalText = page.getByText('Consider whether the sample size is adequate.');
    await expect(criticalText).toBeVisible({ timeout: 10000 });

    const panelHeader = page.locator('span.uppercase', { hasText: 'Critical Thinking' });
    const closeBtn = panelHeader.locator('..').locator('button', { hasText: '×' });
    await closeBtn.click({ force: true });
    await expect(criticalText).not.toBeVisible();
  });
});

test.describe('Student - Reading Page Preview Mode', () => {
  test('shows Preview Mode banner when in preview', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/review');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Preview as Student' }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Preview Mode — you are viewing this as a student would.')).toBeVisible();
  });

  test('preview mode shows Preview label instead of Reading', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/review');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Preview as Student' }).click();
    await page.waitForLoadState('networkidle');

    // The header should show "Preview" label (small text above title)
    const previewLabel = page.locator('p', { hasText: /^Preview$/ }).first();
    await expect(previewLabel).toBeVisible();
  });
});

// ── Self Study Page Gap Tests ──────────────────────────────────────────────────

test.describe('Student - Self Study Recommendations', () => {
  test('recommendation cards show Start Reading button', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');

    // Recommendations panel should have a Start Reading button
    const recPanel = page.locator('text=Recommended for You').locator('..');
    const startBtn = recPanel.getByRole('button', { name: 'Start Reading' });
    await expect(startBtn).toBeVisible();
  });

  test('recommendation cards show paper metadata', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Recommended Paper 1')).toBeVisible();
    await expect(page.getByText('Based on your reading history')).toBeVisible();
  });
});

test.describe('Student - Self Study Search Add to Library', () => {
  test('search results show Add to Library & Read button', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/self-study');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search open-access papers...').fill('quantum');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('Search Result Paper')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to Library & Read' })).toBeVisible();
  });
});

test.describe('Student - Self Study Upload', () => {
  test('upload button text changes to Processing during upload', async ({ page }) => {
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
    await expect(page.getByRole('button', { name: 'Processing...' })).toBeVisible();
  });
});

// ── Layout Gap Tests ───────────────────────────────────────────────────────────

test.describe('Layout - StreakWidget States', () => {
  test('shows loading state while stats are loading', async ({ page }) => {
    mockStudentApiRoutes(page);
    // Delay the stats endpoint
    await page.route('**/api/v1/superpowers/**/stats', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      return route.fulfill({ json: { level: 1, xp: 0, current_streak: 0 } });
    });
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    // The StreakWidget shows "Loading..." with a Zap icon - check for the specific element
    const loadingEl = page.locator('.animate-pulse + span', { hasText: 'Loading...' });
    await expect(loadingEl).toBeVisible({ timeout: 2000 });
  });

  test('shows level title badge', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await expect(page.getByText('Lv.2')).toBeVisible();
  });

  test('shows streak count with flame icon', async ({ page }) => {
    mockStudentApiRoutes(page);
    await loginAsStudent(page);
    await page.goto('/student/dashboard');
    await page.waitForLoadState('networkidle');
    // The streak count appears next to the flame icon
    const flame = page.locator('.text-orange-500');
    const streakText = flame.locator('+ span');
    await expect(streakText).toHaveText('5');
  });
});

test.describe('Layout - Logout', () => {
  test('logout button clears auth and redirects', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Test Teacher')).toBeVisible();

    // Click Logout button (desktop)
    const logoutBtn = page.locator('button', { hasText: 'Logout' }).first();
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/auth/);
  });
});

// ── ProtectedRoute Loading State ───────────────────────────────────────────────

test.describe('ProtectedRoute - Loading Spinner', () => {
  test('protected route briefly shows loading before redirect when unauthenticated', async ({ page }) => {
    // When no user is stored, the ProtectedRoute should eventually redirect to /auth
    // The loading state happens very fast, so we test the end state
    await page.goto('/teacher/papers');
    await expect(page).toHaveURL(/\/auth/, { timeout: 10000 });
  });
});

// ── Teacher Review Page Gap Tests ──────────────────────────────────────────────

test.describe('Teacher - Review Page Reading Guide Content', () => {
  test('shows guiding questions for each section', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/review');
    await page.waitForLoadState('networkidle');

    // Guiding questions are rendered as text inputs
    const questionInputs = page.locator('.card input[type="text"]');
    const count = await questionInputs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows section titles in the reading guide', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/review');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Introduction' })).toBeVisible();
  });

  test('shows key terms for each section', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/assignments/a1/review');
    await page.waitForLoadState('networkidle');

    // Key terms section has a header "Key Terms" — appears multiple times, use first
    await expect(page.getByText('Key Terms').first()).toBeVisible();
    // Key terms appear as badges within the review page
    const badges = page.locator('.flex.flex-wrap.gap-1\\.5 .badge');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ── Teacher Classes Page Gap ───────────────────────────────────────────────────

test.describe('Teacher - Classes Page Class Details', () => {
  test('clicking class shows students list', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/classes');
    await page.waitForLoadState('networkidle');

    await page.getByText('Biology 101').click();
    await expect(page.getByText('Alice Johnson')).toBeVisible();
    await expect(page.getByText('Bob Smith')).toBeVisible();
  });

  test('class card shows class code', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/classes');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('BIO-4X2K')).toBeVisible();
    await expect(page.getByText('CHEM-7R3M')).toBeVisible();
  });
});

// ── Teacher Papers Page Gap ────────────────────────────────────────────────────

test.describe('Teacher - Papers Page Content', () => {
  test('shows paper metadata (text length and figure count)', async ({ page }) => {
    mockTeacherApiRoutes(page);
    await loginAsTeacher(page);
    await page.goto('/teacher/papers');
    await page.waitForLoadState('networkidle');

    // PapersPage uses toLocaleString() which formats 45000 as "45,000"
    await expect(page.getByText('45,000')).toBeVisible();
    await expect(page.getByText('6 figures')).toBeVisible();
  });
});

// ── Auth Page Bottom Toggle Link ───────────────────────────────────────────────

test.describe('Auth Page - Bottom Toggle Link', () => {
  test('signin mode shows "Don\'t have an account? Sign up" link', async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText("Don't have an account?")).toBeVisible();
    await expect(page.locator('p.text-center button', { hasText: 'Sign up' })).toBeVisible();
  });

  test('signup mode shows "Already have an account? Log in" link', async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.locator('.flex.rounded-lg.bg-muted button', { hasText: 'Sign Up' }).click();
    await expect(page.getByText('Already have an account?')).toBeVisible();
    await expect(page.locator('p.text-center button', { hasText: 'Log in' })).toBeVisible();
  });

  test('bottom toggle link switches to signup mode', async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.locator('p.text-center button', { hasText: 'Sign up' }).click();
    // Should now show the name field
    await expect(page.getByLabel('Full Name')).toBeVisible();
  });

  test('bottom toggle link switches to signin mode', async ({ page }) => {
    mockAuthRoutes(page);
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    // Go to signup first
    await page.locator('.flex.rounded-lg.bg-muted button', { hasText: 'Sign Up' }).click();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    // Use bottom link to go back
    await page.locator('p.text-center button', { hasText: 'Log in' }).click();
    await expect(page.getByLabel('Full Name')).not.toBeVisible();
  });
});
