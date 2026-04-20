# OnePass — Internal App → Public Multi-Tenant SaaS Migration Plan

> **Status:** Draft v3 — April 2026
> **Author:** Architecture analysis
> **Scope:** Full SaaS roadmap (tenancy, auth, ops, compliance, billing-ready, launch)

### Changelog

- **v3 (April 2026)** — Locked the six previously-open decisions: single-domain URL with `/{orgSlug}/...`, per-Event Participant IDs, renameable org slug with 301 redirect, Entra External ID Customer (CIAM) flavour, EU-only launch region, fully free product (no paid tiers).
- **v2 (April 2026)** — Incorporates PR #5 (Event Name + Parameters page, default-activity priority, per-user activity allowlist, user enable/disable, per-activity reset, single-activity guarantee). Settings becomes per-Org; allowlists move from `UserEntity` to `MembershipEntity`; `EventName` migrates into the new `EventEntity`.
- **v1 (April 2026)** — Initial deep analysis and 8-phase roadmap.

---

## 1. Executive summary

OnePass today is a **single-tenant internal application** for tracking participant
activity via QR/badge scanning. To turn it into a **public, multi-tenant SaaS**
we must:

1. Introduce an **Organization** (tenant) entity and a **Membership** join so
   one user can belong to many orgs.
2. Add a new **Event** layer above the existing `Activity` (new hierarchy:
   `Org → Event → Activity → Participants/Scans`).
3. Replace the home-grown JWT/password auth with **Microsoft Entra External ID
   (CIAM)** federating Email, Google, Microsoft personal + Work, GitHub, Apple,
   Facebook and LinkedIn.
4. Re-partition every Cosmos container to be tenant-scoped and thread an
   `ITenantContext` through every service so cross-tenant access is impossible
   by construction.
5. Build the operational, compliance and billing-ready layers required to run a
   public SaaS responsibly.

User-confirmed decisions (locked):

| Topic | Decision |
|-------|----------|
| Tenancy model | **Organization-based** — users can belong to multiple orgs and leave them |
| Event vs Activity | **Event contains Activities** (new hierarchy) |
| Auth providers (launch) | Email + password, Google, Microsoft personal + Work/Entra, GitHub, Apple, Facebook, LinkedIn |
| Auth implementation | **Microsoft Entra External ID — Customer (CIAM) flavour** |
| URL strategy | **Single domain** with `/{orgSlug}/...` path-based routing |
| Org slug | **Renameable** — old slug serves a 301 redirect to the new slug |
| Participant ID scope | **Per-Event** — IDs are unique within an Event and can be recycled across events |
| Launch regions | **EU only** for beta (single region, EU data residency by default) |
| Pricing model | **Free software** — no paid tiers, no billing integration; usage limits exist purely for abuse protection |
| Migration of existing data | **Wiped** at Phase 1 cutover (single internal install — no data migration script) |
| Scope | Full SaaS roadmap |

---

## 2. Current-state findings (verified from code)

### 2.1 Data model — single-tenant, hardcoded partition keys

> Updated for PR #5: `SettingsEntity` (singleton), `UserEntity.AllowedActivityIds` and `UserEntity.DefaultActivityId`, `ActivityEntity.IsDefault` (derived from settings).

| Entity | File | Partition key today | Problem for SaaS |
|--------|------|---------------------|------------------|
| `UserEntity` | [src/OnePass.Api/Models/UserEntity.cs](../src/OnePass.Api/Models/UserEntity.cs) | Literal `"User"` (single partition for ALL users) | No tenant link; doesn't scale; hot partition risk. New `AllowedActivityIds`/`DefaultActivityId` are **app-global** today — must become **per-org** (move to `MembershipEntity`). |
| `ActivityEntity` | [src/OnePass.Api/Models/ActivityEntity.cs](../src/OnePass.Api/Models/ActivityEntity.cs) | Literal `"Activity"` | No tenant link; no parent Event. `IsDefault` flag is currently derived from a single global `SettingsEntity.DefaultActivityId` — must become per-Event. |
| `ParticipantEntity` | [src/OnePass.Api/Models/ParticipantEntity.cs](../src/OnePass.Api/Models/ParticipantEntity.cs) | `ActivityId` ✓ | Already per-activity, but no tenant boundary |
| `ScanEntity` | [src/OnePass.Api/Models/ScanEntity.cs](../src/OnePass.Api/Models/ScanEntity.cs) | `ActivityId` ✓ + inverted-tick RowKey for newest-first | Same — needs tenant scoping |
| `Roles` | [src/OnePass.Api/Models/Roles.cs](../src/OnePass.Api/Models/Roles.cs) | Two global roles: `Admin`, `User` | Roles must be per-org, not global |
| `SettingsEntity` *(new in PR #5)* | `src/OnePass.Api/Models/SettingsEntity.cs` | Singleton (single row) | Holds `EventName` + global `DefaultActivityId`. **Singleton must become per-Org**: `EventName` migrates into `EventEntity`; `DefaultActivityId` becomes `Event.DefaultActivityId`. |

### 2.2 Authentication & authorization

- **Local password auth only** — [`AuthController.Login`](../src/OnePass.Api/Controllers/AuthController.cs) verifies a PBKDF2 hash and [`JwtTokenService`](../src/OnePass.Api/Auth/JwtTokenService.cs) issues a self-signed HS256 JWT.
- **Anonymous account enumeration** — [`GET /api/auth/usernames`](../src/OnePass.Api/Controllers/AuthController.cs) returns every active username; clearly OK for a demo, **not** for public SaaS.
- **Anonymous registration** — `POST /api/auth/register` creates `Role=User` directly, no email verification, no captcha.
- **Seed admin** — [`Program.cs`](../src/OnePass.Api/Program.cs) creates `admin@onepass.local / Devoxx2026!` on every cold start if missing.
- **Global super-admin role** — `[Authorize(Roles = Roles.Admin)]` lets any admin mutate any data, including the new admin-only `PUT /api/settings` and per-user enable/disable / allowlist endpoints introduced in PR #5.
- **Catastrophic global reset** — [`POST /api/admin/reset`](../src/OnePass.Api/Controllers/AdminController.cs) wipes all activities, participants and scans across the entire database (now also recreates an empty default activity and repoints the global default at it). In a multi-tenant world this would delete every customer.
- **New per-activity reset** — `POST /api/activities/{id}/reset` (PR #5) deletes participants + scans for one activity; in SaaS this must require `OrgAdmin`+ AND verify the activity belongs to the caller's active org.

### 2.3 Infrastructure ([infra/resources.bicep](../infra/resources.bicep))

- Cosmos DB (NoSQL, **serverless**), Managed Identity + RBAC, key auth disabled ✓.
- One Linux App Service (B1) hosting both the API and the bundled SPA — single-origin design ✓.
- Containers: `users`, `activities`, `participants`, `scans` — all on `/partitionKey`.
- JWT signing key is derived from `uniqueString(resourceGroup().id)` — stable but not Key-Vault-managed and not rotatable.
- No WAF, no Front Door, no custom domain, no deployment slots, single region.

### 2.4 Frontend ([src/OnePass.Web](../src/OnePass.Web))

- React 19 + Vite + PWA + offline scan queue (`localStorage`).
- i18n EN / FR ([`src/OnePass.Web/src/i18n`](../src/OnePass.Web/src/i18n)).
- No tenant/org selector; pages: Login, Dashboard, Activities, Participants, Scan, Admin, **Parameters** (PR #5), Users.
- `AppLayout` displays the global `EventName` next to the brand and links to `/parameters` (PR #5).
- Scan page already implements default-activity resolution `userDefault ?? adminDefault ?? first` filtered by the user's allowlist — this logic ports cleanly to the SaaS world by replacing "global default" with "event default" and "user allowlist" with "membership allowlist".
- Auth state lives in [`src/OnePass.Web/src/auth.tsx`](../src/OnePass.Web/src/auth.tsx) (JWT in `localStorage`).

---

## 3. Multi-tenancy gap analysis

| # | Gap | Impact | Phase |
|---|-----|--------|-------|
| 1 | No `Organization` / `Membership` entities | Cannot represent customers, billing, or "leave org" | 1 |
| 2 | All entities globally visible (single partition key) | Cross-tenant data leak unavoidable | 1 |
| 3 | No `Event` layer above `Activity` | Cannot model "conference with sessions" or "festival with workshops". PR #5 added `SettingsEntity.EventName` as a global string — this clearly belongs on a per-org `EventEntity`. | 1 |
| 4 | No tenant context in requests | Every controller/service touches global data, including the new `SettingsController` and per-activity reset | 3 |
| 5 | `Admin` role is global | Customers can't have their own admins; we can't have platform-level admins distinct from customers | 3 |
| 6 | `POST /api/admin/reset` wipes everything | Single click ⇒ all customers' data gone | 3 |
| 6b | `POST /api/activities/{id}/reset` *(PR #5)* has no tenant check | An admin in any org could reset another org's activity if they knew the id | 3 |
| 7 | Local password auth only | No social, no enterprise, no MFA, no password reset flow | 2 |
| 8 | Account enumeration (`/api/auth/usernames`) | OWASP A07 (Identification & Auth) | 0 |
| 9 | No email verification on register | Spam accounts trivial | 2 |
| 10 | No rate limiting | Brute force, scraping, scan flooding | 5 |
| 11 | No audit log | Cannot satisfy GDPR / SOC 2 | 6 |
| 12 | No GDPR export / erasure endpoint | Required before public EU launch | 6 |
| 13 | No multi-region, no WAF, no slots | Single point of failure, no safe rollouts | 5 |
| 14 | No billing data fields | Cannot enable monetization later without a second migration | 7 |
| 15 | `UserEntity.AllowedActivityIds` / `DefaultActivityId` *(PR #5)* are app-global | A user belonging to multiple orgs would carry one allowlist across all of them | 1 (move to `MembershipEntity`) |
| 16 | `SettingsEntity` is a singleton | Two customers cannot have different event names or default activities at once | 1 (split into `OrganizationEntity` / `EventEntity`) |
| 17 | `UserEntity.IsActive` *(enable/disable from PR #5)* is global | Disabling a user blocks them from every org they belong to; should be per-membership | 3 |

---

## 4. Target architecture

### 4.1 New entity hierarchy

```
Organization (tenant)
└── Memberships (User ↔ Org with org-scoped Role)
└── Events
    └── Activities (the existing concept, now nested)
        ├── Participants
        └── Scans
```

### 4.2 Target data model

> Mapping for PR #5 fields:
> - `SettingsEntity.EventName` → `EventEntity.Name` (per Event).
> - `SettingsEntity.DefaultActivityId` → `EventEntity.DefaultActivityId` (per Event).
> - `UserEntity.AllowedActivityIds` → `MembershipEntity.AllowedActivityIds` (per Org membership).
> - `UserEntity.DefaultActivityId` → `MembershipEntity.DefaultActivityId` (per Org membership; user may also keep a cross-org `User.DefaultOrgId`/`DefaultEventId`).
> - `UserEntity.IsActive` → `MembershipEntity.Status` (per-membership enable/disable). A separate global `UserEntity.IsLocked` remains for platform-level abuse handling.
> - `ActivityEntity.IsDefault` (derived) → still derived, now from `EventEntity.DefaultActivityId`.

| Container | Partition strategy | New / changed fields |
|-----------|---------------------|----------------------|
| `organizations` | PK = `OrgId` | `Name`, `Slug` (unique URL-friendly), `OwnerUserId`, `Plan` (Free/Pro/Enterprise — placeholder), `Status` (Active/Suspended/Deleted), `Region`, `BrandingSettings`, `RetentionDays`, `Limits` (max events, members, scans/mo), `CreatedAt` |
| `memberships` | PK = `OrgId`, RowKey = `UserId` | `Role` (`OrgOwner`/`OrgAdmin`/`EventCoordinator`/`Scanner`/`Viewer`), `Status` (Pending/Active/**Disabled**/Removed), `InvitedBy`, `JoinedAt`, **`AllowedActivityIds[]`**, **`DefaultActivityId`**, **`DefaultEventId`** *(from PR #5, now per-membership)* |
| `invitations` | PK = `OrgId`, RowKey = invite token | `Email`, `Role`, `ExpiresAt`, `AcceptedByUserId` |
| `events` | PK = `OrgId`, RowKey = `EventId` | `Name` *(absorbs `SettingsEntity.EventName`)*, `Slug`, `Description`, `StartsAt`, `EndsAt`, `Venue`, `Branding`, **`DefaultActivityId`** *(absorbs `SettingsEntity.DefaultActivityId`)*, `IsArchived`, `CreatedByUserId` |
| `activities` | **Hierarchical PK** `[OrgId, EventId]`, RowKey = `ActivityId` | + `OrgId`, `EventId`. `IsDefault` remains a **derived** flag (computed from `Event.DefaultActivityId`). |
| `participants` | **Hierarchical PK** `[OrgId, EventId]`, RowKey = `ParticipantId` | + `OrgId`, `EventId`, optional `ActivityIds[]` |
| `scans` | **Hierarchical PK** `[OrgId, ActivityId]`, RowKey = inverted-tick + GUID | + `OrgId`, `EventId` |
| `users` | PK = `UserId` (one partition per user; users are global across orgs) | Strip `Role` (now per-org). Strip `AllowedActivityIds`/`DefaultActivityId`/`IsActive` (moved to `MembershipEntity`). Add `DefaultOrgId`, `ExternalIdentities[]` (provider, sub, email), `Locale`, `IsLocked` (platform-level) |
| `audit_events` | PK = `OrgId`, RowKey = inverted-tick | `Actor`, `Action`, `TargetType`, `TargetId`, `Metadata`, `IpHash`, `UserAgent` — **must log** PR #5 actions: `settings.update`, `activity.reset`, `user.disable/enable`, `membership.allowlist.update` |
| `usage_records` (Phase 7) | PK = `OrgId`, RowKey = `YYYY-MM` | `Scans`, `ActiveParticipants`, `Members`, `Events` |

> Note: there is no `settings` container in the SaaS target. The single-row settings record from PR #5 is fully absorbed into `organizations` and `events`.

> **Why Hierarchical Partition Keys (HPK)?** They lift Cosmos' 20 GB single-partition cap and let queries that filter by `OrgId` (the common case) hit a small subtree instead of fanning out, while still allowing per-Activity analytics to remain a single-partition read.

### 4.3 Cosmos composite indexes

- `activities`, `events`: `[/orgId asc, /eventId asc, /startsAt desc]`
- `scans`: `[/orgId asc, /activityId asc, /scannedAt desc]`
- `memberships`: `[/userId asc, /status asc]` (lookup "all orgs for a user")

### 4.4 Identity architecture (Entra External ID / CIAM)

```
[ Browser / SPA (MSAL.js, PKCE) ]
        │
        │  OIDC (id_token, access_token w/ orgId, orgRole)
        ▼
[ Microsoft Entra External ID — customer tenant ]
        │ federates ↘
        │   - Email + password (built-in)
        │   - Google
        │   - Microsoft personal + Work/School (built-in)
        │   - GitHub  (custom OIDC)
        │   - Apple   (custom OIDC)
        │   - Facebook, LinkedIn (built-in social)
        │
        │  Custom Authentication Extension (token-issuance start)
        │  ─→ POST /api/identity/claims  (lookup active org + role)
        ▼
[ OnePass API — Microsoft.Identity.Web validates JWTs ]
        │
        ▼
[ Cosmos DB — tenant-scoped reads/writes ]
```

### 4.5 Org-scoped RBAC

| Role | Scope | Capabilities |
|------|-------|-------------|
| `PlatformAdmin` | Global (OnePass operators only) | Suspend orgs, view audit, run reports |
| `OrgOwner` | Per-org | Everything inside org including delete-org and ownership transfer |
| `OrgAdmin` | Per-org | Manage members, billing, branding, all events |
| `EventCoordinator` | Per-org | Create/edit events + activities, manage participants |
| `Scanner` | Per-org | Record scans, view today's events |
| `Viewer` | Per-org | Read-only dashboards & reports |

---

## 5. Phased roadmap

### Phase 0 — Security hygiene (ship today, no SaaS dependency)

- Remove anonymous `GET /api/auth/usernames` (account enumeration / OWASP A07).
- Move JWT signing key to Key Vault reference; rotate.
- Remove production seed admin from [`Program.cs`](../src/OnePass.Api/Program.cs); replace with one-shot bootstrap script.
- Add structured logging with correlation id; ensure App Insights captures user/org dimensions (used in Phase 1+).
- STRIDE threat model on the public surface (auth, scan, registration, admin reset).

### Phase 1 — Multi-tenant data model (BREAKING)

**Goal:** every row owned by exactly one Organization; queries always tenant-scoped.

- Add models: `OrganizationEntity`, `MembershipEntity`, `EventEntity`, `InvitationEntity`, `AuditEvent`.
- Rewrite `UserEntity` (drop `Role`, `IsActive`, `AllowedActivityIds`, `DefaultActivityId`; add `ExternalIdentities[]`, `DefaultOrgId`, `Locale`, `IsLocked`).
- Move `AllowedActivityIds`, `DefaultActivityId`, per-user enable/disable (PR #5) onto `MembershipEntity` so they are scoped to a single org.
- **Delete `SettingsEntity` / `SettingsService` / `SettingsController`** (PR #5). Migrate `EventName` → `EventEntity.Name` and `DefaultActivityId` → `EventEntity.DefaultActivityId`. New endpoint surface becomes `PUT /api/orgs/{orgId}/events/{eventId}` for both.
- Switch `ActivityEntity`, `ParticipantEntity`, `ScanEntity` to **hierarchical partition keys** (`[OrgId, EventId]` / `[OrgId, ActivityId]`). Keep the derived `IsDefault` flag, now computed against `Event.DefaultActivityId`.
- Preserve PR #5 invariants: at least one activity must always exist **per Event** (not per app); deleting the default activity must clear `Event.DefaultActivityId`; per-activity reset must remain available, scoped to the org.
- Update [`CosmosTableStoreFactory`](../src/OnePass.Api/Repositories/CosmosTableStoreFactory.cs) and `ITableStoreFactory` to support HPK (compose `PartitionKey` via `PartitionKeyBuilder`) and tenant-scoped queries (`WHERE c.orgId = @org`).
- Update [`infra/resources.bicep`](../infra/resources.bicep): add new containers, recreate existing ones with HPK + composite indexes; remove the `settings` container that PR #5 will introduce.
- **No backward migration**: single internal install ⇒ wipe & re-seed acceptable; document explicitly.

### Phase 2 — Identity & Authentication (Entra External ID / CIAM)

**Goal:** Replace local password issuance with managed CIAM; email + password becomes one provider among many.

- Provision **Microsoft Entra External ID** (Customer flavour) tenant. Configure user flows for all required providers.
- App registrations: SPA (PKCE) + API (audience).
- Backend: replace `AddJwtBearer` self-config in [`Program.cs`](../src/OnePass.Api/Program.cs) with **`Microsoft.Identity.Web`** validating CIAM-issued tokens (issuer, audience, JWKS).
- Delete [`JwtTokenService`](../src/OnePass.Api/Auth/JwtTokenService.cs) and the Login/Register/Usernames endpoints in [`AuthController`](../src/OnePass.Api/Controllers/AuthController.cs).
- Token enrichment via **CIAM Custom Authentication Extension** calling `POST /api/identity/claims` to inject `orgId` + `orgRole` into the issued token.
- First-login provisioning: when a token's `oid` claim has no matching `UserEntity`, auto-create one and start the "create or join your first organization" flow.
- Frontend: switch [`auth.tsx`](../src/OnePass.Web/src/auth.tsx) to `@azure/msal-browser` + `@azure/msal-react`. Add provider selector on login screen.
- Delegated to CIAM (no code): MFA, password reset, account lockout, email verification.

### Phase 3 — Authorization & tenant context

**Goal:** every request is tenant-aware; defense in depth at controller, service and repo layers.

- New scoped `ITenantContext` populated by middleware from `orgId` claim or `X-OnePass-Org` header (allowing org switch). Middleware verifies the user has an active membership in that org → 403 otherwise.
- Replace `[Authorize(Roles = Roles.Admin)]` with policy-based authz (`OrgOwner`, `OrgAdmin`, `EventCoordinator`, `Scanner`, `Viewer`, `PlatformAdmin`).
- All `*Service` methods take `OrgId` from `ITenantContext` and pass it to repos as part of the partition key.
- Add `OrganizationService`, `EventService`, `MembershipService`, `InvitationService`.
- Re-home PR #5 endpoints under tenant scope:
  - `PUT /api/settings` → `PUT /api/orgs/{orgId}/events/{eventId}` (Event Name + default activity); requires `OrgAdmin`.
  - `POST /api/activities/{id}/reset` → `POST /api/orgs/{orgId}/events/{eventId}/activities/{id}/reset`; requires `OrgAdmin`; verify activity belongs to the active org+event before deleting.
  - `PATCH /api/users/{id}` (allowlist, default, enable/disable) → `PATCH /api/orgs/{orgId}/memberships/{userId}`; requires `OrgAdmin`. "Disable user" becomes "set membership status = Disabled" (only affects this org).
  - `PATCH /api/me` (user picks own default activity) → `PATCH /api/orgs/{orgId}/memberships/me`; validated against the membership's allowlist.
- **Delete** `AdminController.Reset`. Replace with:
  - `DELETE /api/orgs/{orgId}` — soft-delete, 30-day purge job (`OrgOwner` only).
  - `DELETE /api/orgs/{orgId}/events/{eventId}` — hard-delete cascade within org (`OrgAdmin`+); preserves the PR #5 "at least one activity per event" invariant by recreating an empty default after wipe.
- Org switch endpoint: `POST /api/me/active-org` → triggers token refresh with new `orgId` claim.

### Phase 4 — Public-facing UX & onboarding

- **Self-service signup**: sign up via any provider → email verified by CIAM → "Create your organization" page → first user becomes `OrgOwner`. Or accept a pending invitation.
- **Org switcher** in [`AppLayout.tsx`](../src/OnePass.Web/src/AppLayout.tsx) header (combobox), persisted via `User.DefaultOrgId`. Replaces today's static `EventName` brand element with `{Org.Name} · {Event.Name}`.
- **Default selectors** in user profile: default Org + per-org default Event + per-membership default Activity (from PR #5, now scoped per membership).
- **Per-event Parameters page** (evolves PR #5's `/parameters`): admin can edit Event Name, default activity, retention, branding; "Reset all data" becomes "Reset this event" and is `OrgAdmin`-only with a typed-confirmation modal. The per-user default-activity control stays for everyone but reads/writes the **membership** default rather than a global user field.
- **Per-org Members page** (evolves PR #5's UsersPage): allowed-activities checkboxes, Active column, Enable/Disable button — all scoped to the current membership only.
- **Invitations UI**: org admins invite by email + role; recipient gets magic link → joins org.
- **Leave organization** in profile (`DELETE /api/orgs/{orgId}/memberships/me`); blocks last `OrgOwner` from leaving without ownership transfer.
- **Marketing site** (separate Vite/Next or Static Web App): landing, pricing placeholder, docs, privacy, terms, contact.
- **Public event pages** (optional): signed URL `/p/{org-slug}/{event-slug}` for participant self-registration.
- **Localization expansion**: add ES, DE, JA bundles to [`src/OnePass.Web/src/i18n`](../src/OnePass.Web/src/i18n); locale switcher at app + org level. Carry over PR #5 i18n keys (`parameters.*`, `activity.default/resetScans/cannotDeleteLast`, `users.active/disable/allowedActivities/defaultActivity`).
- **Branding per org**: logo + primary colour from `OrganizationEntity.BrandingSettings`, applied to dashboard and email templates.

### Phase 5 — Operational readiness

- **Multi-region**: Cosmos additional read region; App Service paired-region failover via Front Door.
- **Custom domain + WAF**: Azure Front Door Premium with WAF (OWASP CRS); HTTPS-only; `app.onepass.app` plus optional per-org subdomain.
- **Rate limiting**: ASP.NET Core `AddRateLimiter` per IP and per `OrgId`. Throttle anonymous endpoints aggressively.
- **Background jobs**: extract [`RetentionService`](../src/OnePass.Api/Services/RetentionService.cs) to Azure Container Apps Jobs + Cosmos change-feed processor for analytics.
- **Observability**: App Insights with `OrgId`/`UserId` custom dimensions; OpenTelemetry distributed tracing; alerts (5xx rate, p95 scan latency, 429 rate, failed-login spikes).
- **Backup**: Cosmos continuous backup (PITR); per-org export endpoint (CSV/JSON) on demand.
- **Secrets**: Key Vault for everything; rotation policy.
- **CI/CD**: PR validation pipeline, staging slot, blue/green via App Service slots, post-deploy smoke tests, automatic rollback on health-check failure.
- **Runbooks**: incident response, GDPR data deletion, org suspension, support escalation.

### Phase 6 — Compliance, privacy & legal

- **GDPR**: data subject access (`GET /api/me/export`), right-to-erasure (`DELETE /api/me` purges memberships + anonymises scans).
- **DPA + Terms of Service + Privacy Policy + Cookie banner** (required before public EU launch).
- **Data residency**: `OrganizationEntity.Region` drives container routing; document EU/US options.
- **Audit log**: `audit_events` container (PK=`OrgId`, append-only) for admin actions, role changes, deletions, exports.
- **PII inventory + retention policies** documented per entity.
- **SOC 2 Type 1** prep checklist (later: pen-test, vendor questionnaires).

### Phase 7 — Billing-ready (designed, not implemented)

- `OrganizationEntity.Plan`, `SubscriptionId`, `BillingEmail`, `Limits` provisioned in Phase 1.
- Pluggable `IBillingProvider` abstraction (Stripe + Azure Marketplace adapters later).
- Usage metering: count scans, active participants per org per month → App Insights custom metrics + nightly `usage_records` rollup.
- Plan-gate decorators on services (`RequireFeature("CustomBranding")`) — return `402 Payment Required` today, enforce later.
- Trial flag on org (14 days). Suspension already supported by `OrganizationEntity.Status`.

### Phase 8 — Quality, testing & launch

- Expand xUnit suites: tenant isolation tests (User from Org A cannot read Org B's data — every controller).
- New Playwright e2e flows: signup → create org → invite user → accept → create event → create activity → scan → leave org.
- Load test (Azure Load Testing or k6): 100 orgs × 1 k scans/min target.
- Security testing: ZAP baseline scan in CI, dependency scanning (Dependabot + `dotnet list package --vulnerable`).
- Public beta: invite-only with feature flag → open signup.

---

## 6. Execution order

1. **Phase 0 hardening** — independent, do immediately.
2. **Phase 1 data model** — *blocks all subsequent phases*. Update Bicep, `Models/`, `Repositories/`, factory to use HPK; add new entities. Wipe dev data.
3. **Phase 2 CIAM** — *parallel with Phase 3 design*. Provision tenant, swap auth scheme, MSAL on frontend.
4. **Phase 3 authz/tenant context** — *depends on 1 + 2*. Middleware + service refactor + delete unsafe admin endpoints.
5. **Phase 4 UX/onboarding** — *depends on 3*. Org switcher, signup flow, invitations.
6. **Phase 5 ops + Phase 6 compliance** — *parallel*, both depend on 4 functioning.
7. **Phase 7 billing scaffolding** — *parallel with 5/6*; safe to do early since it's mostly data fields + interfaces.
8. **Phase 8 launch quality gates** — *depends on all above*.

---

## 7. Files that will change (or be created)

### Backend (`src/OnePass.Api`)

| File | Change |
|------|--------|
| [`Models/UserEntity.cs`](../src/OnePass.Api/Models/UserEntity.cs) | Strip `Role`, `IsActive`, `AllowedActivityIds` *(PR #5)*, `DefaultActivityId` *(PR #5)*; add `ExternalIdentities[]`, `DefaultOrgId`, `Locale`, `IsLocked` |
| [`Models/ActivityEntity.cs`](../src/OnePass.Api/Models/ActivityEntity.cs) | Add `OrgId`, `EventId`; switch to HPK; keep derived `IsDefault` (now from `Event.DefaultActivityId`) |
| [`Models/ParticipantEntity.cs`](../src/OnePass.Api/Models/ParticipantEntity.cs) | Add `OrgId`, `EventId`; HPK |
| [`Models/ScanEntity.cs`](../src/OnePass.Api/Models/ScanEntity.cs) | Add `OrgId`, `EventId`; HPK |
| [`Models/Roles.cs`](../src/OnePass.Api/Models/Roles.cs) | Replace with org-scoped role enum + `PlatformAdmin` |
| `Models/SettingsEntity.cs` *(PR #5)* | **Delete** — absorbed into `EventEntity` (Name + DefaultActivityId) |
| `Services/SettingsService.cs` *(PR #5)* | **Delete** — logic moves to `EventService` |
| `Controllers/SettingsController.cs` *(PR #5)* | **Delete** — routes move under `/api/orgs/{orgId}/events/{eventId}` |
| `Models/OrganizationEntity.cs` | **NEW** |
| `Models/MembershipEntity.cs` | **NEW** — owns per-membership `AllowedActivityIds`, `DefaultActivityId`, `DefaultEventId`, `Status` (incl. `Disabled` from PR #5) |
| `Models/EventEntity.cs` | **NEW** — owns `Name` (was `SettingsEntity.EventName`) and `DefaultActivityId` (was `SettingsEntity.DefaultActivityId`) |
| `Models/InvitationEntity.cs` | **NEW** |
| `Models/AuditEvent.cs` | **NEW** — must record PR #5 actions (`settings.update`, `activity.reset`, `user.disable/enable`, `membership.allowlist.update`) |
| [`Program.cs`](../src/OnePass.Api/Program.cs) | Replace `AddJwtBearer` with `Microsoft.Identity.Web`; remove dev seed; add tenant middleware, rate limiter, policy-based authz; remove `SettingsService` DI registration |
| [`Controllers/AuthController.cs`](../src/OnePass.Api/Controllers/AuthController.cs) | Delete `Login`/`Register`/`Usernames`; keep `Me` enriched with active org. PR #5's `PATCH /me` (set own default activity) moves to `PATCH /api/orgs/{orgId}/memberships/me` |
| [`Controllers/AdminController.cs`](../src/OnePass.Api/Controllers/AdminController.cs) | **Delete `Reset`**; replaced with org-scoped delete in `OrganizationsController`. The PR #5 "recreate empty default activity after wipe" behaviour moves to `EventService.ResetEventAsync` |
| [`Controllers/UsersController.cs`](../src/OnePass.Api/Controllers/AuthController.cs) | **Delete** (lives at the bottom of `AuthController.cs` today). Replaced by `MembershipsController` whose `PATCH` endpoint absorbs PR #5's allowlist + enable/disable + default-activity logic per-org |
| [`Controllers/ActivitiesController.cs`](../src/OnePass.Api/Controllers/ActivitiesController.cs) | Nest under `/api/orgs/{orgId}/events/{eventId}/activities`; require tenant context. Keep PR #5's per-activity reset (now scoped) and "cannot delete last activity" guard — enforce **per-event** instead of per-app |
| `Controllers/OrganizationsController.cs` | **NEW** |
| `Controllers/EventsController.cs` | **NEW** — absorbs PR #5's `PUT /api/settings` as `PUT /api/orgs/{orgId}/events/{eventId}` |
| `Controllers/MembershipsController.cs` | **NEW** — absorbs PR #5's `POST /api/users` (with allowlist validation) and `PATCH /api/users/{id}` (enable/disable, allowlist, default) |
| `Controllers/InvitationsController.cs` | **NEW** |
| `Controllers/MeController.cs` | **NEW** — defaults, leave-org, GDPR export/erasure |
| [`Repositories/CosmosTableStoreFactory.cs`](../src/OnePass.Api/Repositories/CosmosTableStoreFactory.cs) | HPK support, tenant-scoped queries, composite indexes |
| [`Repositories/ITableStoreFactory.cs`](../src/OnePass.Api/Repositories/ITableStoreFactory.cs) | Accept `PartitionKey[]` (composite) |
| [`Auth/JwtTokenService.cs`](../src/OnePass.Api/Auth/JwtTokenService.cs) | **Delete** after CIAM cutover |
| `Auth/TenantContext.cs` | **NEW** |
| `Auth/TenantMiddleware.cs` | **NEW** |
| `Auth/AuthorizationPolicies.cs` | **NEW** |
| All [`Services/*.cs`](../src/OnePass.Api/Services) | Take `OrgId` (from `ITenantContext`) on every method |

### Infrastructure (`infra/`)

| File | Change |
|------|--------|
| [`infra/resources.bicep`](../infra/resources.bicep) | Add CIAM reference, Front Door + WAF, Key Vault, paired region, deployment slot, recreate containers with HPK + composite indexes, add `organizations`/`memberships`/`events`/`invitations`/`audit_events` |
| [`infra/main.bicep`](../infra/main.bicep) / [`main.parameters.json`](../infra/main.parameters.json) | New params: CIAM tenant id, custom domain, region pair |

### Frontend (`src/OnePass.Web`)

| File | Change |
|------|--------|
| [`src/auth.tsx`](../src/OnePass.Web/src/auth.tsx) | Replace local-token store with MSAL React context; expose active membership (role + allowlist + default activity) instead of global user fields |
| [`src/api.ts`](../src/OnePass.Web/src/api.ts) | Acquire access token via MSAL; add `X-OnePass-Org` header for org switching |
| [`src/AppLayout.tsx`](../src/OnePass.Web/src/AppLayout.tsx) | Org switcher in header. Replace PR #5's static `EventName` element with `{Org.Name} · {Event.Name}` |
| [`src/pages/LoginPage.tsx`](../src/OnePass.Web/src/pages/LoginPage.tsx) | Provider buttons (Email, Google, MS, GitHub, Apple, FB, LinkedIn) |
| [`src/pages/ParametersPage.tsx`](../src/OnePass.Web/src/pages/ParametersPage.tsx) *(PR #5)* | Re-scope to current Event: Event Name + default activity edit `OrgAdmin`-only; "Reset all data" becomes "Reset this event" with typed confirmation; per-user default-activity control writes `MembershipEntity.DefaultActivityId` |
| [`src/pages/UsersPage.tsx`](../src/OnePass.Web/src/pages/UsersPage.tsx) *(PR #5)* | Renamed to `MembersPage`; allowed-activities + Enable/Disable apply to the **membership**, not the global user |
| [`src/pages/ScanPage.tsx`](../src/OnePass.Web/src/pages/ScanPage.tsx) *(PR #5)* | Default-activity resolution stays (`userDefault ➉ adminDefault ➉ first`) but reads `Membership.DefaultActivityId` and `Event.DefaultActivityId` and filters by `Membership.AllowedActivityIds` |
| [`src/pages/ActivitiesPage.tsx`](../src/OnePass.Web/src/pages/ActivitiesPage.tsx) *(PR #5)* | Keep Default badge, per-row Reset, last-activity-protection — but apply per-Event |
| **NEW** `src/pages/SignupOnboardingPage.tsx` | First-time wizard (create / join org) |
| **NEW** `src/pages/OrgSettingsPage.tsx`, `OrgMembersPage.tsx`, `OrgInvitationsPage.tsx` | Per-org admin |
| **NEW** `src/pages/ProfilePage.tsx` | Default org selector, leave-org, GDPR export/delete |
| [`src/i18n/`](../src/OnePass.Web/src/i18n) | Add ES, DE, JA bundles; org-branding tokens; carry over PR #5 keys (`parameters.*`, `activity.default/resetScans/cannotDeleteLast`, `users.active/disable/allowedActivities/defaultActivity`) under per-org/per-event semantics |

### Tests

| File | Change |
|------|--------|
| **NEW** `src/OnePass.Api.Tests/TenantIsolationTests.cs` | Cross-org access ⇒ 403/404 |
| **NEW** `src/OnePass.Api.Tests/MembershipServiceTests.cs` | |
| **NEW** `src/OnePass.Api.Tests/OrganizationServiceTests.cs` | |
| **NEW** `tests/e2e/tests/signup-and-create-org.spec.ts` | |
| **NEW** `tests/e2e/tests/invite-and-join.spec.ts` | |
| **NEW** `tests/e2e/tests/tenant-isolation.spec.ts` | |
| **NEW** `tests/e2e/tests/leave-org.spec.ts` | |

### Other

| File | Change |
|------|--------|
| [`azure.yaml`](../azure.yaml) | Add `marketing` service if hosted in repo |
| [`README.md`](../README.md) | Update for SaaS posture, drop demo seed admin docs |

---

## 8. Verification & quality gates

1. **Unit:** `dotnet test src/OnePass.sln` — `TenantIsolationTests` prove cross-org reads return 404/403.
2. **e2e:** `npx playwright test tests/e2e/tests/tenant-isolation.spec.ts` — User A in Org A cannot see Org B's `/api/orgs/{B}/events`.
3. **Load:** Azure Load Testing — 50 concurrent orgs, p95 scan < 300 ms, no 5xx, no cross-tenant leakage in logs.
4. **Security:** ZAP baseline scan against staging — no Highs; dependency scan green.
5. **Auth:** manual sign-in with each provider (Email, Google, MS, GitHub, Apple, FB, LinkedIn) → token contains `orgId` claim.
6. **Compliance:** `GET /api/me/export` returns full user data; `DELETE /api/me` removes memberships and anonymises scans (verified via audit log).
7. **Ops:** simulated region failover (stop primary App Service) → Front Door routes to secondary within 30 s.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| **Cross-tenant data leak** (highest-impact SaaS risk) | Defense in depth: tenant middleware → policy authz → service-layer `OrgId` param → HPK at storage. Automated isolation tests in CI. |
| **HPK migration breaks existing data** | Accepted — single internal install; data wipe is documented and explicit. |
| **CIAM custom claim extension latency** | Cache resolved claims in token (short TTL); fall back to `/api/identity/claims` lookup on cache miss. |
| **Last-`OrgOwner` orphans an org** | Server-side block on leave; force ownership transfer or org deletion. |
| **Rate-limit per-IP unfair behind NAT** | Combine IP + `OrgId` + `Sub` keys; document expected limits per plan. |
| **Free-tier abuse** | Email verification (CIAM), captcha on signup, plan-gated limits in `OrganizationEntity.Limits`. |
| **PII residency violation** | `OrganizationEntity.Region` enforced at provisioning time; cross-region replication only within the same residency boundary. |
| **Vendor lock-in to Entra External ID** | Auth abstracted via `Microsoft.Identity.Web` + standard OIDC; could be swapped for Auth0/Clerk if needed (with rework). |

---

## 10. Out of scope (this plan)

- Actual Stripe / Azure Marketplace integration (Phase 7 only scaffolds).
- Native mobile apps.
- On-prem / self-hosted distribution.
- White-label reseller programme.
- Advanced analytics / ML insights.

---

## 11. Decisions (resolved)

All previously-open items are now locked. They override any earlier text in this document if there is a conflict.

1. **URL strategy** — **single domain** `app.onepass.app` with path-based routing `/{orgSlug}/...`. No wildcard subdomain at launch. Simplifies TLS, DNS and Front Door routing.
2. **Participant ID scope** — **per-Event**. Uniqueness constraint is `(OrgId, EventId, ParticipantId)`. Customers can recycle the same printed badge IDs across events.
3. **Org slug** — **renameable**. The old slug record stays in the `organizations` container (or a small `org_slug_redirects` lookup) marked as a redirect; HTTP requests for the old path return `301 Moved Permanently` to the new path. Old slugs are reserved for 90 days before they can be claimed by another org.
4. **CIAM tenant flavour** — **Microsoft Entra External ID, Customer (CIAM)** flavour (not Workforce). Provisioned during Phase 2.
5. **Launch region** — **EU only** for the beta. Single Azure region (recommend `westeurope` primary, `northeurope` paired for backup/PITR). All Cosmos containers, App Service, Front Door origin and CIAM tenant pinned to EU. Other regions deferred until post-beta.
6. **Pricing model** — **Free software**. No paid tiers, no Stripe / Marketplace integration ever in scope.
   - Phase 7 is **rescoped**: it is no longer billing-readiness but **fair-use & abuse-protection**. Keep `OrganizationEntity.Limits` (max events / members / scans per month) but treat values as anti-abuse caps, not commercial gates. Plan-gate decorators are dropped; replaced with a single `EnforceFairUse` policy that returns `429 Too Many Requests` with a friendly message when limits are exceeded.
   - `OrganizationEntity.Plan`, `SubscriptionId`, `BillingEmail` and the `IBillingProvider` abstraction are **not** added — no second migration required if monetization is ever revisited later, since adding nullable fields is non-breaking.
   - Marketing site has no "Pricing" page; replace with a "Free & open" section explaining the fair-use limits and (if applicable) the open-source license.
   - Add a clear in-app notice on signup: "OnePass is free to use. Fair-use limits apply to keep the service available for everyone."

### Implications carried into other sections

- **Section 4.2** — `OrganizationEntity` keeps `Slug`; add `PreviousSlugs[]` (or a sibling `org_slug_redirects` container keyed by old slug) for the rename-with-301 behaviour. `ParticipantEntity` uniqueness becomes `(OrgId, EventId, ParticipantId)`; HPK already enforces this at the partition level.
- **Section 4.4** — CIAM provisioning checklist must explicitly select "External ID for customers" tenant type in the EU geography.
- **Phase 5** — Front Door origin pinned to EU; rate-limiting policy is the **primary** enforcement layer (no plan tiers to differentiate). WAF custom rule rewrites `/{oldSlug}/...` to `/{newSlug}/...` with 301 based on the redirect lookup.
- **Phase 7** rescoped to "Fair-use & abuse protection" — see point 6 above.
- **Section 6** (compliance) — EU-only simplifies GDPR posture (single jurisdiction), but the privacy policy must still cover EU data subjects globally if the marketing site is reachable worldwide. Consider geo-fencing signup to EEA at launch.

---

*End of plan.*


---

## Changelog v4 \u2014 implementation sweep (this commit)

This entry summarises the actual code that landed against the plan above. The
plan itself is left untouched as the strategic source of truth; deviations are
called out here.

### Shipped

- **Phase 0 / hardening**
  - JWT signing key moved out of an App Setting and into Azure Key Vault.
    infra/resources.bicep now provisions a Microsoft.KeyVault/vaults
    resource (RBAC-authorized), grants the API's user-assigned managed
    identity the Key Vault Secrets User role, and the Jwt__SigningKey
    App Setting is rewritten to a @Microsoft.KeyVault(SecretUri=...)
    reference. The deploying user also receives the role for local debugging.
  - CorrelationIdMiddleware assigns / forwards X-Correlation-Id and
    pushes a logging scope so every log line within the request is
    correlatable.

- **Phase 3 / cleanup**
  - The legacy global Settings row, controller, service, model and tests
    are gone. Event Name + default activity now live on
    EventEntity per organisation. EventsController.Update keeps
    ActivityEntity.IsDefault in sync so the existing SPA badge renders
    without a per-request join.
  - OrganizationEntity gained a generous Limits block
    (MaxEvents, MaxMembers, MaxScansPerMonth) for fair-use enforcement.

- **Phase 5 / observability + fair-use**
  - Application Insights wired in (AddApplicationInsightsTelemetry).
  - TenantTelemetryInitializer enriches every telemetry item with
    OrgId, OrgRole, UserId, CorrelationId so per-tenant analytics
    are trivial in the portal.
  - `FairUseRateLimiter` registers two policies:
    - `anon-strict` (30 req/min/IP) on `/api/auth/login` + `register`
    - `tenant-fair-use` (600 req/min, sliding, partitioned by org+user)
    - plus a 1200 req/min/IP global fallback.
    Rejections return `429` with a friendly JSON body and `Retry-After`.

- **Phase 6 / GDPR + SaaS UX**
  - `MeController` adds `GET /api/me/export` (full JSON export of the
    user's data across every org) and `DELETE /api/me` (right-to-erasure,
    with a `409 last_owner` guard so a sole OrgOwner cannot orphan a
    tenant).
  - New SPA pages: `SignupOnboardingPage`, `OrgSettingsPage`,
    `OrgMembersPage`, `OrgInvitationsPage`, `ProfilePage` plus a
    persistent `CookieBanner` mounted from `main.tsx`.
  - i18n bundles added for `es`, `de`, `ja`; `LanguageSelect` now
    surfaces five flags.

- **Tests**
  - New e2e specs: `signup-and-create-org.spec.ts`,
    `invite-and-join.spec.ts`, `tenant-isolation.spec.ts`,
    `leave-org.spec.ts`.
  - All 61 xUnit tests still pass after the Settings deletion.

### Deferred (still on the plan, not yet implemented)

- **B \u2014 Nested REST routes** (`/api/orgs/{orgId}/{events|activities|...}`)
  remain mostly flat because cascading the URL change through the SPA
  breaks every existing route + bookmark in one commit. Will land as a
  dedicated PR with redirect shims for `/api/activities` etc.
- **F \u2014 Cosmos hierarchical partition keys** (`/orgId, /eventId, /id`)
  are NOT live; current containers still use single-path `/partitionKey`.
  Migration requires a one-shot data copy that is out of scope here.
- **H \u2014 Front Door + WAF** is not provisioned. The Bicep change is
  significant and adds operational cost; it should be paired with a custom
  domain decision.
- **L \u2014 Microsoft Entra External ID (CIAM)** integration is not started.
  `AuthController.Login`/`Register` still live and use HS256 JWTs. CIAM
  is the next-phase replacement but requires tenant provisioning + SPA
  MSAL integration.
- `UserEntity.Role` / `IsActive` / `AllowedActivityIds` / `DefaultActivityId`
  are kept for now so the existing Activities UI continues to function;
  they are slated for deletion once the per-membership equivalents replace
  every read site.

### How to verify locally

\\\pwsh
dotnet build src/OnePass.sln
dotnet test src/OnePass.sln
cd src/OnePass.Web; npm run build
cd ../../tests/e2e; npx tsc --noEmit -p tsconfig.json
\\\

All four pass at this commit (61/61 unit tests green, no TS errors, SPA
bundle emits to `src/OnePass.Api/wwwroot`).
