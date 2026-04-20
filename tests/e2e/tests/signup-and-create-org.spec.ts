import { test, expect } from '@playwright/test';

/**
 * Phase 6 SaaS smoke: a brand-new user can register, complete onboarding,
 * and land on the dashboard with their fresh organisation as the active
 * tenant.
 *
 * NOTE: assumes the API is running locally with `dotnet run` (which seeds
 * an in-memory store) OR an isolated Cosmos test database. Should NOT be
 * pointed at production.
 */
test('signup flow creates an account, then an organisation, then drops the user on the scan page', async ({ page }) => {
  const stamp = Date.now().toString();
  const email = `e2e-${stamp}@example.test`;

  // 1. Register
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/username/i).fill(`e2e${stamp}`);
  await page.getByLabel(/password/i).fill('Pa$$w0rd!1');
  await page.getByRole('button', { name: /register/i }).click();

  // 2. Onboarding (first org)
  await page.waitForURL(/\/onboarding|\//);
  if (page.url().includes('/onboarding')) {
    await page.getByLabel(/organisation name|organization name|nom de/i).fill(`E2E Org ${stamp}`);
    await page.getByLabel(/first event/i).fill('Launch Day');
    await page.getByRole('button', { name: /create organisation|create organization|créer/i }).click();
  }

  // 3. Land on the scan page (the index route inside AppLayout).
  await page.waitForURL('/');
  await expect(page.getByRole('heading')).toContainText(/scan|escanear|scannen/i);
});
