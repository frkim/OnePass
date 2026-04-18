import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Devoxx2026!';

/**
 * End-to-end admin login flow + scan recording.
 *
 * Uses the seed admin credentials that the API creates on first start in any
 * non-shared environment. Override via the E2E_ADMIN_USER / E2E_ADMIN_PASSWORD
 * env vars when running against an environment with a different admin.
 */
test.describe('authenticated flow', () => {
  test('admin can sign in, sees Scan as the landing page, and records a scan', async ({ page }) => {
    // ---- Sign in ----
    await page.goto('/login');
    await page.getByLabel(/email or username/i).fill(ADMIN_USER);
    await page.getByLabel(/^password$/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // After login the index route is the Scan page. Use a generous timeout
    // to absorb first-hit cold-start latency on a freshly deployed App Service
    // (Cosmos SDK initialization can take 10–20s on the very first request).
    await expect(page.getByRole('heading', { name: /scan participant/i })).toBeVisible({ timeout: 30_000 });

    // ---- Record a scan manually ----
    // The seeded "default" activity is preselected in the dropdown.
    const uniqueBadge = `e2e-${Date.now()}`;
    await page.getByLabel(/participant id/i).fill(uniqueBadge);
    await page.getByRole('button', { name: /record scan manually/i }).click();

    await expect(page.getByText(/scan recorded/i)).toBeVisible();
    await expect(page.getByText(uniqueBadge)).toBeVisible();

    // ---- Second scan for the same badge should be flagged as duplicate ----
    await page.getByLabel(/participant id/i).fill(uniqueBadge);
    await page.getByRole('button', { name: /record scan manually/i }).click();
    await expect(page.getByText(/already been scanned/i)).toBeVisible();
  });
});
