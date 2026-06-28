/**
 * ReadLabs Playwright Test Helpers
 * Provides reusable utilities for authentication, API mocking, and common interactions.
 */

const TEACHER_USER = {
  id: 'test-teacher-001',
  email: 'teacher@test.com',
  name: 'Test Teacher',
  role: 'teacher',
  access_token: 'fake-jwt-teacher-token',
};

const STUDENT_USER = {
  id: 'test-student-001',
  email: 'student@test.com',
  name: 'Test Student',
  role: 'student',
  access_token: 'fake-jwt-student-token',
};

/**
 * Inject a logged-in user session via localStorage.
 * This bypasses the real auth flow by directly setting the stored user data.
 */
async function loginAs(page, user) {
  await page.goto('/');
  await page.evaluate((userData) => {
    localStorage.setItem('readlabs_user', JSON.stringify(userData));
  }, user);
}

/**
 * Log in as a teacher.
 */
async function loginAsTeacher(page) {
  await loginAs(page, TEACHER_USER);
}

/**
 * Log in as a student.
 */
async function loginAsStudent(page) {
  await loginAs(page, STUDENT_USER);
}

/**
 * Set up API route mocks for common teacher endpoints.
 * Returns mock data that tests can reference for assertions.
 */
function mockTeacherApiRoutes(page) {
  const mockPapers = [
    { id: 'p1', title: 'Neural Networks in Biology', text_length: 45000, figure_count: 6 },
    { id: 'p2', title: 'CRISPR Gene Editing Review', text_length: 32000, figure_count: 4 },
  ];

  const mockClasses = [
    {
      id: 'c1',
      name: 'Biology 101',
      class_code: 'BIO-4X2K',
      students: [
        { student_id: 's1', student_name: 'Alice Johnson' },
        { student_id: 's2', student_name: 'Bob Smith' },
      ],
    },
    {
      id: 'c2',
      name: 'AP Chemistry',
      class_code: 'CHEM-7R3M',
      students: [],
    },
  ];

  const mockAssignment = {
    id: 'a1',
    paper_id: 'p1',
    paper_title: 'Neural Networks in Biology',
    class_id: 'c1',
    status: 'published',
    difficulty: 'intermediate',
    reading_guide: {
      difficulty: 'intermediate',
      sections: [
        {
          title: 'Introduction',
          section_type: 'Introduction',
          text: 'This paper explores the intersection of neural networks and biological systems.',
          guiding_questions: [
            'What is the main research question?',
            'Why is this topic important?',
          ],
          key_terms: ['neural network', 'biological systems', 'deep learning'],
          teacher_notes: '',
        },
        {
          title: 'Methods',
          section_type: 'Methods',
          text: 'We employed a mixed-methods approach with quantitative analysis.',
          guiding_questions: ['What methodology was used?'],
          key_terms: ['mixed-methods', 'quantitative analysis'],
          teacher_notes: '',
        },
        {
          title: 'Results',
          section_type: 'Results',
          text: 'Our findings show significant improvements in model accuracy.',
          guiding_questions: ['What were the key findings?'],
          key_terms: ['accuracy', 'model performance'],
          teacher_notes: '',
        },
      ],
    },
  };

  const mockDashboard = {
    class: { name: 'Biology 101' },
    students: [
      { student_id: 's1', student_name: 'Alice Johnson', sessions: [{ assignment_id: 'a1', status: 'completed', current_section_index: 3 }] },
      { student_id: 's2', student_name: 'Bob Smith', sessions: [{ assignment_id: 'a1', status: 'in_progress', current_section_index: 1 }] },
    ],
    assignments: [mockAssignment],
  };

  const mockLandmarkPapers = {
    items: [
      {
        paper_id: 'lp1',
        title: 'Attention Is All You Need',
        created_at: '2026-06-01',
        levels: [
          { difficulty: 'beginner', assignment_id: 'la1' },
          { difficulty: 'intermediate', assignment_id: 'la2' },
          { difficulty: 'advanced', assignment_id: 'la3' },
        ],
      },
    ],
    has_more: false,
  };
  const mockFeaturedLandmarks = [mockLandmarkPapers.items[0]];
  const assignCalls = [];

  // Intercept all API calls and return mock data
  page.route('**/api/v1/papers/**', (route) => {
    if (route.request().method() === 'GET' && route.request().url().endsWith('/papers/')) {
      return route.fulfill({ json: mockPapers });
    }
    if (route.request().method() === 'POST' && route.request().url().includes('/papers/upload')) {
      return route.fulfill({
        json: { id: 'p3', title: 'New Paper', text_length: 0, figure_count: 0 },
      });
    }
    return route.fulfill({ json: {} });
  });

  // classesApi.list() hits the bare `/classes` path (no trailing slash), which
  // the `**/api/v1/classes/**` glob below does not cover (`/**` needs a segment).
  // Handle the list endpoint (both slash forms) here so the AssignToClassModal
  // class picker resolves to mockClasses.
  page.route('**/api/v1/classes', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: mockClasses });
    }
    return route.fulfill({ json: {} });
  });

  page.route('**/api/v1/classes/**', (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && url.endsWith('/classes/')) {
      return route.fulfill({ json: mockClasses });
    }
    if (route.request().method() === 'GET' && url.includes('/classes/c1')) {
      return route.fulfill({ json: mockClasses[0] });
    }
    if (route.request().method() === 'GET' && url.includes('/classes/c2')) {
      return route.fulfill({ json: mockClasses[1] });
    }
    if (route.request().method() === 'POST' && url.endsWith('/classes/')) {
      return route.fulfill({
        json: { id: 'c3', name: 'New Class', class_code: 'NEW-1A2B', students: [] },
      });
    }
    if (route.request().method() === 'DELETE' && url.includes('/students/')) {
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  page.route('**/api/v1/assignments/**', (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && url.match(/\/assignments\/a1$/)) {
      return route.fulfill({ json: mockAssignment });
    }
    if (route.request().method() === 'POST' && url.endsWith('/assignments/')) {
      return route.fulfill({ json: { id: 'a2', ...mockAssignment } });
    }
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ json: { ...mockAssignment, status: 'published' } });
    }
    return route.fulfill({ json: mockAssignment });
  });

  page.route('**/api/v1/library/landmark**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/library/landmark/featured')) {
      return route.fulfill({ json: mockFeaturedLandmarks });
    }
    if (method === 'POST' && url.includes('/library/landmark/assign')) {
      const body = route.request().postDataJSON();
      assignCalls.push(body);
      return route.fulfill({
        json: {
          assignment_id: 'cls-asn-1',
          class_id: (body && body.class_id) || 'c1',
          paper_id: (body && body.paper_id) || 'lp1',
          difficulty: (body && body.difficulty) || 'intermediate',
          status: 'published',
        },
      });
    }
    if (url.includes('/library/landmark')) {
      return route.fulfill({ json: mockLandmarkPapers });
    }
    return route.fulfill({ json: {} });
  });

  page.route('**/api/v1/dashboard/**', (route) => {
    return route.fulfill({ json: mockDashboard });
  });

  return { mockPapers, mockClasses, mockAssignment, mockDashboard, mockLandmarkPapers, assignCalls };
}

/**
 * Set up API route mocks for student endpoints.
 */
function mockStudentApiRoutes(page) {
  const mockEnrolledClasses = [
    {
      class_id: 'c1',
      class_name: 'Biology 101',
      class_code: 'BIO-4X2K',
      teacher_name: 'Test Teacher',
      assignments: [
        { id: 'a1', paper_title: 'Neural Networks in Biology', difficulty: 'intermediate' },
        { id: 'a2', paper_title: 'CRISPR Gene Editing', difficulty: 'beginner' },
      ],
    },
  ];

  const mockSessions = [
    { assignment_id: 'a1', status: 'in_progress' },
    { assignment_id: 'a2', status: 'not_started' },
  ];

  const mockSession = {
    session_id: 'sess1',
    assignment_id: 'a1',
    paper_title: 'Neural Networks in Biology',
    current_section_index: 0,
    reading_guide: {
      difficulty: 'intermediate',
      sections: [
        {
          title: 'Introduction',
          section_type: 'Introduction',
          text: 'This paper explores the intersection of neural networks and biological systems. The research gap is significant.',
          guiding_questions: ['What is the main research question?', 'Why is this topic important?'],
          key_terms: ['neural network', 'biological systems', 'deep learning'],
          teacher_notes: '',
        },
        {
          title: 'Methods',
          section_type: 'Methods',
          text: 'We employed a mixed-methods approach with quantitative analysis.',
          guiding_questions: ['What methodology was used?'],
          key_terms: ['mixed-methods', 'quantitative analysis'],
          teacher_notes: '',
        },
        {
          title: 'Results',
          section_type: 'Results',
          text: 'Our findings show significant improvements in model accuracy.',
          guiding_questions: ['What were the key findings?'],
          key_terms: ['accuracy', 'model performance'],
          teacher_notes: '',
        },
      ],
    },
    checkpoints: [],
    sowhat: null,
  };

  const mockLibraryPapers = [
    {
      id: 'lib1',
      title: 'Quantum Computing Basics',
      authors: 'Alice et al.',
      year_published: 2024,
      category: 'Computer Science',
      assignment: { id: 'a3', difficulty: 'beginner', status: 'published' },
    },
    {
      id: 'lib2',
      title: 'Organic Chemistry Reactions',
      authors: 'Bob et al.',
      year_published: 2023,
      category: 'Chemistry',
      assignment: { id: 'a4', difficulty: 'advanced', status: 'published' },
    },
  ];

  const mockLandmarkPapers = {
    items: [
      {
        paper_id: 'lp1',
        title: 'Attention Is All You Need',
        created_at: '2026-06-01',
        levels: [
          { difficulty: 'beginner', assignment_id: 'la1' },
          { difficulty: 'intermediate', assignment_id: 'la2' },
          { difficulty: 'advanced', assignment_id: 'la3' },
        ],
      },
      {
        paper_id: 'lp2',
        title: 'Deep Residual Learning for Image Recognition',
        created_at: '2026-06-02',
        levels: [{ difficulty: 'intermediate', assignment_id: 'lb1' }],
      },
      {
        paper_id: 'lp3',
        title: 'Generative Adversarial Networks',
        created_at: '2026-06-03',
        levels: [{ difficulty: 'beginner', assignment_id: 'lc1' }],
      },
    ],
    has_more: false,
  };
  const mockFeaturedLandmarks = [mockLandmarkPapers.items[0]];
  const mockLandmarkProgress = {
    progress: [
      { assignment_id: 'la2', status: 'in_progress', current_section_index: 1, completed_at: null },
      { assignment_id: 'lb1', status: 'completed', current_section_index: 2, completed_at: '2026-06-20' },
    ],
  };

  const mockCategories = ['Biology', 'Computer Science', 'Chemistry', 'Physics'];
  const mockRecommendations = [
    { paper: { id: 'rec1', title: 'Recommended Paper 1' }, assignment_id: 'rec-asn-1', reason: 'Based on your reading history' },
  ];
  const mockStats = { level: 2, xp: 150, current_streak: 5 };

  page.route('**/api/v1/enrollment/**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: mockEnrolledClasses });
    }
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  page.route('**/api/v1/sessions/**', (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && (url.endsWith('/sessions/') || url.endsWith('/sessions'))) {
      return route.fulfill({ json: mockSessions });
    }
    if (route.request().method() === 'POST' && (url.endsWith('/sessions/') || url.endsWith('/sessions'))) {
      return route.fulfill({ json: mockSession });
    }
    if (route.request().method() === 'GET' && url.includes('/sessions/sess')) {
      return route.fulfill({ json: mockSession });
    }
    if (route.request().method() === 'POST' && url.includes('/checkpoint')) {
      return route.fulfill({ json: { ok: true } });
    }
    if (route.request().method() === 'POST' && url.includes('/sowhat')) {
      return route.fulfill({ json: { ok: true } });
    }
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ json: { ok: true } });
    }
    if (route.request().method() === 'POST' && url.includes('/jargon')) {
      return route.fulfill({ json: { explanation: 'A neural network is a computing system inspired by biological neural networks in the brain.' } });
    }
    if (route.request().method() === 'POST' && url.includes('/keyterm')) {
      return route.fulfill({ json: { explanation: 'This term refers to computational models based on the structure and functions of biological neural networks.' } });
    }
    return route.fulfill({ json: mockSession });
  });

  page.route('**/api/v1/library/**', (route) => {
    const url = route.request().url();
    if (url.includes('/library/landmark/featured')) {
      return route.fulfill({ json: mockFeaturedLandmarks });
    }
    if (url.includes('/library/landmark/progress')) {
      return route.fulfill({ json: mockLandmarkProgress });
    }
    if (url.includes('/library/landmark')) {
      return route.fulfill({ json: mockLandmarkPapers });
    }
    if (url.includes('/library/browse')) {
      return route.fulfill({ json: mockLibraryPapers });
    }
    if (url.includes('/library/categories')) {
      return route.fulfill({ json: mockCategories });
    }
    if (url.includes('/library/search')) {
      return route.fulfill({ json: [{ core_id: 'core1', title: 'Search Result Paper', authors: 'Search Author' }] });
    }
    return route.fulfill({ json: {} });
  });

  page.route('**/api/v1/superpowers/**', (route) => {
    const url = route.request().url();
    if (url.includes('/superpowers/stats')) {
      return route.fulfill({ json: mockStats });
    }
    if (url.includes('/superpowers/recommendations')) {
      return route.fulfill({ json: mockRecommendations });
    }
    if (url.includes('/superpowers/critical-prompt')) {
      return route.fulfill({ json: { prompt_text: 'Consider whether the sample size is adequate.', prompt_type: 'methodology' } });
    }
    if (url.includes('/superpowers/quiz') && route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    if (url.includes('/superpowers/quiz/generate')) {
      return route.fulfill({
        json: [
          { id: 'q1', question_text: 'What is the main topic?', question_type: 'multiple_choice', options: ['Biology', 'Physics', 'Chemistry', 'Math'] },
          { id: 'q2', question_text: 'Explain the methodology used.', question_type: 'short_answer' },
        ],
      });
    }
    if (url.includes('/superpowers/quiz/submit')) {
      return route.fulfill({
        json: {
          score: 2, max_score: 3, results: [
            { question_id: 'q1', score: 1, max: 1, correct_answer: 'Biology', explanation: 'The paper is about biology.' },
            { question_id: 'q2', score: 1, max: 2, correct_answer: 'Mixed methods', explanation: 'The methodology combined quantitative and qualitative analysis.' },
          ],
        },
      });
    }
    if (url.includes('/superpowers/xp')) {
      return route.fulfill({ json: { xp_added: 10 } });
    }
    return route.fulfill({ json: {} });
  });

  return { mockEnrolledClasses, mockSessions, mockSession, mockLibraryPapers, mockLandmarkPapers, mockLandmarkProgress, mockStats };
}

/**
 * Mock the auth API endpoints.
 *
 * Signup returns the new shape — `{user_id, email_confirmation_required}` —
 * which matches the post-security-review backend contract. There are no
 * tokens at signup; the user must confirm their email and then sign in.
 */
function mockAuthRoutes(page) {
  page.route('**/api/v1/auth/**', (route) => {
    if (route.request().url().includes('/auth/signup')) {
      return route.fulfill({
        json: { user_id: 'new-user', email_confirmation_required: true },
      });
    }
    if (route.request().url().includes('/auth/signin')) {
      return route.fulfill({
        json: TEACHER_USER,
      });
    }
    return route.fulfill({ json: {} });
  });
}

module.exports = {
  TEACHER_USER,
  STUDENT_USER,
  loginAs,
  loginAsTeacher,
  loginAsStudent,
  mockTeacherApiRoutes,
  mockStudentApiRoutes,
  mockAuthRoutes,
};
