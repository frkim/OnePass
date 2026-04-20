import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Phase 4 self-service: a member can leave an organisation, and the
 * server enforces the "last OrgOwner cannot leave" rule with a 409.
 */
test('leave-org happy path + last-owner block', async ({ baseURL }) => {
  const ctx = await pwRequest.newContext({ baseURL });
  const stamp = Date.now().toString();
  const passwd = 'Pa$$w0rd!1';

  // Owner registers + creates org.
  const ownerLogin = await (await ctx.post('/api/auth/register', {
    data: { email: `owner-${stamp}@e.test`, username: `o${stamp}`, password: passwd },
  })).json();
  const org = await (await ctx.post('/api/orgs', {
    headers: { Authorization: `Bearer ${ownerLogin.token}` },
    data: { name: `LeaveOrg-${stamp}` },
  })).json();

  // Sole owner CANNOT leave.
  const blocked = await ctx.delete(`/api/orgs/${org.id}/memberships/me`, {
    headers: { Authorization: `Bearer ${ownerLogin.token}`, 'X-OnePass-Org': org.id },
  });
  expect(blocked.status()).toBe(409);

  // Add a second user via invitation, accept it, then leaving works.
  const memberLogin = await (await ctx.post('/api/auth/register', {
    data: { email: `m-${stamp}@e.test`, username: `m${stamp}`, password: passwd },
  })).json();
  const inv = await (await ctx.post(`/api/orgs/${org.id}/invitations`, {
    headers: { Authorization: `Bearer ${ownerLogin.token}`, 'X-OnePass-Org': org.id },
    data: { email: `m-${stamp}@e.test`, role: 'Scanner' },
  })).json();
  await ctx.post(`/api/orgs/${org.id}/invitations/${encodeURIComponent(inv.token)}/accept`, {
    headers: { Authorization: `Bearer ${memberLogin.token}` },
  });

  const left = await ctx.delete(`/api/orgs/${org.id}/memberships/me`, {
    headers: { Authorization: `Bearer ${memberLogin.token}`, 'X-OnePass-Org': org.id },
  });
  expect(left.ok()).toBeTruthy();

  // Member should no longer see the org.
  const orgs = await (await ctx.get('/api/me/orgs', {
    headers: { Authorization: `Bearer ${memberLogin.token}` },
  })).json();
  expect(orgs.find((o: { id: string }) => o.id === org.id)).toBeFalsy();
});
