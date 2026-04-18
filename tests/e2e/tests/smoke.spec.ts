import { test, expect } from '@playwright/test';

/**
 * Basic smoke test: the SPA loads and the login page is rendered.
 * This works against both a dev server (Vite on 5173) and a production bundle
 * served by the API (App Service).
 */
test('login page loads and displays the OnePass branding', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/OnePass/i);
  // The Sign in heading is rendered by LoginPage and is localized.
  await expect(page.getByRole('heading', { name: /sign in to onepass/i })).toBeVisible();
});

test('health endpoint is reachable', async ({ request }) => {
  const resp = await request.get('/health');
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.status).toBe('ok');
});
