import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the OnePass end-to-end tests.
 *
 * The tests run against a full-stack instance: the .NET API serves both the
 * bundled SPA and the REST endpoints on the same origin. By default we start
 * the API on http://localhost:5248 and rely on the SPA being bundled into
 * src/OnePass.Api/wwwroot. For local iteration we instead point the tests at
 * the Vite dev server (http://localhost:5173) which proxies /api to 5248.
 *
 * Override with the BASE_URL environment variable to run against a deployed
 * instance (e.g. the Azure App Service URL).
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
