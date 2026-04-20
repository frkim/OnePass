import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Phase 3 multi-tenant isolation: a member of org A must not be able to
 * read or mutate any record belonging to org B \u2014 even with a stolen
 * X-OnePass-Org header. The API should reject the request with 403/404
 * because the JWT-bound membership scope does not include org B.
 */
test('cross-tenant requests are rejected', async ({ baseURL }) => {
  const ctx = await pwRequest.newContext({ baseURL });
  const stamp = Date.now().toString();
  const passwd = 'Pa$$w0rd!1';

  // Two unrelated users + their orgs.
  const aRes = await ctx.post('/api/auth/register', { data: { email: `a-${stamp}@e.test`, username: `a${stamp}`, password: passwd } });
  const aLogin = await aRes.json();
  const aOrgRes = await ctx.post('/api/orgs', {
    headers: { Authorization: `Bearer ${aLogin.token}` },
    data: { name: `OrgA-${stamp}` },
  });
  const aOrg = await aOrgRes.json();

  const bRes = await ctx.post('/api/auth/register', { data: { email: `b-${stamp}@e.test`, username: `b${stamp}`, password: passwd } });
  const bLogin = await bRes.json();
  const bOrgRes = await ctx.post('/api/orgs', {
    headers: { Authorization: `Bearer ${bLogin.token}` },
    data: { name: `OrgB-${stamp}` },
  });
  const bOrg = await bOrgRes.json();

  // User A tries to read org B's events with a forged header.
  const leak = await ctx.get(`/api/orgs/${bOrg.id}/events`, {
    headers: { Authorization: `Bearer ${aLogin.token}`, 'X-OnePass-Org': bOrg.id },
  });
  expect([401, 403, 404]).toContain(leak.status());

  // And with no header at all.
  const leak2 = await ctx.get(`/api/orgs/${bOrg.id}/events`, {
    headers: { Authorization: `Bearer ${aLogin.token}` },
  });
  expect([401, 403, 404]).toContain(leak2.status());

  // Sanity: A can read their OWN org just fine.
  const own = await ctx.get(`/api/orgs/${aOrg.id}/events`, {
    headers: { Authorization: `Bearer ${aLogin.token}`, 'X-OnePass-Org': aOrg.id },
  });
  expect(own.ok()).toBeTruthy();
});
