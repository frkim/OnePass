import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Phase 6 SaaS smoke: an org admin can mint an invitation token, and a
 * second freshly-registered user can accept it and inherit the org's
 * membership rows.
 *
 * Drives the API directly (not the UI) for the token exchange because the
 * SPA does not currently host an /invitations/accept page in this commit
 * \u2014 see TODO in tests/e2e/README.md.
 */
test('invite token flow: admin creates invitation, second user accepts and gains membership', async ({ baseURL }) => {
  const ctx = await pwRequest.newContext({ baseURL });
  const stamp = Date.now().toString();
  const adminEmail = `admin-${stamp}@example.test`;
  const inviteeEmail = `invitee-${stamp}@example.test`;
  const password = 'Pa$$w0rd!1';

  // 1. Admin registers + creates org.
  let res = await ctx.post('/api/auth/register', { data: { email: adminEmail, username: `adm${stamp}`, password } });
  expect(res.ok()).toBeTruthy();
  const adminLogin = await res.json();
  const adminToken = adminLogin.token as string;

  res = await ctx.post('/api/orgs', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { name: `Org-${stamp}` },
  });
  expect(res.ok()).toBeTruthy();
  const org = await res.json();

  // 2. Admin mints an invitation for the future user.
  res = await ctx.post(`/api/orgs/${org.id}/invitations`, {
    headers: { Authorization: `Bearer ${adminToken}`, 'X-OnePass-Org': org.id },
    data: { email: inviteeEmail, role: 'Scanner' },
  });
  expect(res.ok()).toBeTruthy();
  const invitation = await res.json();
  expect(invitation.token).toBeTruthy();

  // 3. Invitee registers (different account) and accepts the invitation.
  res = await ctx.post('/api/auth/register', { data: { email: inviteeEmail, username: `inv${stamp}`, password } });
  expect(res.ok()).toBeTruthy();
  const inviteeLogin = await res.json();

  res = await ctx.post(`/api/orgs/${org.id}/invitations/${encodeURIComponent(invitation.token)}/accept`, {
    headers: { Authorization: `Bearer ${inviteeLogin.token}` },
  });
  expect(res.ok()).toBeTruthy();

  // 4. Invitee can now list memberships and sees the org.
  res = await ctx.get('/api/me/orgs', {
    headers: { Authorization: `Bearer ${inviteeLogin.token}` },
  });
  expect(res.ok()).toBeTruthy();
  const orgs = await res.json();
  expect(orgs.find((o: { id: string }) => o.id === org.id)).toBeTruthy();
});
