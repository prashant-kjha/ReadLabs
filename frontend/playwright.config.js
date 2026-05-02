const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile-subset\.spec\.js$/,
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone SE'] },
      testMatch: /mobile-subset\.spec\.js$/,
    },
    {
      name: 'tablet',
      use: { ...devices['iPad'] },
      testMatch: /mobile-subset\.spec\.js$/,
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 3001',
    port: 3001,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
