# OnePass

OnePass is a **multi-tenant SaaS platform** for tracking participant activity
via badge / QR scanning at events and conferences. Organization owners manage
events and activities, scanners record participant check-ins, and participants
simply present a QR code — no account required.

The whole stack runs on a **single Azure App Service** and a **serverless Azure
Cosmos DB** account: one origin, no CORS, minimal cost.

| Layer          | Technology                                                          |
| -------------- | ------------------------------------------------------------------- |
| Frontend       | React 19 + TypeScript 5.9 + Vite 6, PWA, i18next (EN / FR / ES / DE) |
| Backend        | ASP.NET Core 10 Web API (C#), JWT + OAuth (Google, Microsoft)       |
| Data           | Azure Cosmos DB for NoSQL (serverless) — in-memory fallback for dev |
| Secrets        | Azure Key Vault (JWT signing key, OAuth client secrets)             |
| Identity       | Azure Managed Identity (User-Assigned) in production                |
| Infrastructure | Bicep + Azure Developer CLI (`azd`)                                 |
| Observability  | Log Analytics + Application Insights                                |
| Hosting        | Single Linux App Service serves both the API and the bundled SPA    |
| CI/CD          | GitHub Actions (build + unit + e2e) and `azd up` deploy             |

## Repository layout

```
.
├── azure.yaml                  # Azure Developer CLI service definition (single service)
├── infra/                      # Bicep templates (subscription-scope main + resources)
├── .github/workflows/          # CI + deployment pipelines
├── docs/                       # Additional documentation
├── src/
│   ├── OnePass.sln
│   ├── OnePass.Api/            # ASP.NET Core Web API (also serves wwwroot SPA)
│   ├── OnePass.Api.Tests/      # xUnit unit tests
│   └── OnePass.Web/            # React + Vite frontend (PWA)
├── tests/
│   └── e2e/                    # Playwright end-to-end tests
└── README.md
```

## Features

### Core

- **Single-origin hosting** — the .NET API serves the bundled React SPA from
  `wwwroot` and falls back to `index.html` for client-side routes. One App
  Service, one URL, no CORS surface in production.
- **Activities, participants, scans** — full CRUD for activities, automatic
  participant registration on first scan, one-scan-per-participant policy with
  duplicate detection (surfaced to the UI with the timestamp of the previous
  scan).
- **Reporting & analytics** — admin dashboard with totals and per-day scan
  chart (Chart.js), plus CSV export of raw scan data.
- **Data retention** — background service archives scan records older than the
  configured retention window (30 days by default) to help meet GDPR-style
  obligations.

### Multi-tenancy & access control

- **Organizations** — every resource is scoped to an organization (`OrgId`
  partition key in Cosmos DB). Users can create, join, and switch between
  organizations.
- **Role hierarchy** — `PlatformAdmin` › `OrgOwner` › `OrgAdmin` ›
  `EventCoordinator` › `Scanner` › `Viewer`. Legacy `Admin` / `User` roles
  are still accepted for migration.
- **Invitation system** — org admins invite users by email; invitees accept
  via a token-based link.
- **Tenant resolution** — `TenantContextMiddleware` resolves the active
  organization from: `X-OnePass-Org` header → `org_id` JWT claim →
  `User.DefaultOrgId` → first active membership.
- **Platform admin console** — global stats, org management, and platform-wide
  settings (registration toggle, maintenance banner, default limits).

### Identity & authentication

- **JWT authentication** — HMAC-signed tokens with configurable expiration.
- **OAuth providers** — optional Google and Microsoft sign-in (configure
  client IDs/secrets via Key Vault or app settings).
- **Password management** — registration, forgot-password, and admin-initiated
  password reset flows.

### User experience

- **Internationalization** — English, French, Spanish, and German bundled;
  add new languages by dropping another JSON bundle into
  `src/OnePass.Web/src/i18n/`. Dates format per-locale via
  `Intl.DateTimeFormat`.
- **PWA + offline scanning** — installable manifest, service worker with a
  `NetworkFirst` cache for `GET /api/*`, and a `localStorage` scan queue that
  auto-flushes when the browser reports it is back online.
- **Responsive UI** — works on desktop and mobile; tables scroll horizontally
  inside cards on narrow viewports so action buttons remain reachable.
- **GDPR data export & deletion** — users can export their personal data or
  delete their account via `/api/me`.

## Prerequisites

- [.NET SDK 10.0+](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) and npm
- [Azure Developer CLI (`azd`)](https://aka.ms/azd) — for deployment
- An Azure subscription — optional for local dev

## Running locally

Local development uses an **in-memory store** when no Cosmos endpoint is
configured, so you do not need an Azure account or the Cosmos emulator to
iterate.

### Backend

```pwsh
cd src/OnePass.Api
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run
# API on http://localhost:5248
# Scalar API docs at http://localhost:5248/scalar
```

On first run the API seeds several local accounts:

| User                         | Password        | Role           |
| ---------------------------- | --------------- | -------------- |
| `admin@onepass.local`        | `OnePass2026!`  | Legacy admin   |
| `globaladmin@onepass.local`  | `OnePass2026!`  | Platform admin |
| `user1@onepass.local`        | `OnePass2026!`  | User           |
| `user2@onepass.local`        | `OnePass2026!`  | User           |

A default organization, event, and activity are also created.
**Change or remove these seeds before exposing the API publicly.**

### Frontend

```pwsh
cd src/OnePass.Web
npm install
npm run dev
# Vite at http://localhost:5173 (proxies /api → 5248)
```

### Unit tests

```pwsh
# .NET
dotnet test src/OnePass.sln

# Frontend (Vitest)
cd src/OnePass.Web && npm test
```

### End-to-end tests (Playwright)

```pwsh
cd tests/e2e
npm install
npx playwright install --with-deps chromium
npx playwright test
```

The e2e tests default to `BASE_URL=http://localhost:5173` (Vite). Set
`BASE_URL` to any deployed URL to run them against a real environment, e.g.
`$env:BASE_URL = "https://app-<token>.azurewebsites.net"; npx playwright test`.

See [tests/e2e/README.md](./tests/e2e/README.md) for details.

## Configuration (backend)

All settings live in `src/OnePass.Api/appsettings.json` and can be overridden
via environment variables using the `__` separator (e.g. `Jwt__SigningKey`).

| Key                             | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `Jwt:SigningKey`                | HMAC signing key. **Required** in non-dev environments.  |
| `Jwt:ExpirationMinutes`        | Token lifetime (default 60).                             |
| `Cosmos:Endpoint`              | Cosmos DB account endpoint (auth via Managed Identity).  |
| `Cosmos:ConnectionString`      | Fallback connection string if no endpoint is set.        |
| `Cosmos:DatabaseName`          | Database name (default `onepass`).                       |
| `Retention:RetentionDays`      | Days to keep scan data before archiving (default 30).    |
| `Retention:CheckIntervalHours` | How often the retention sweep runs (default 6 h).        |
| `Cors:Origins`                 | Allowed frontend origins (same-origin by default).       |
| `Auth:Google:ClientId`         | Google OAuth client ID (optional).                       |
| `Auth:Microsoft:ClientId`      | Microsoft OAuth client ID (optional).                    |
| `Bootstrap:SeedDefaultAdmin`   | Seed demo accounts on startup (default `true` in dev).   |

## Deploying to Azure

### One-shot deploy with `azd`

```pwsh
azd auth login
azd up
```

`azd up` provisions (see `infra/resources.bicep`):

- Resource group
- **Azure Cosmos DB for NoSQL, serverless tier** — pay only for the RU/s
  consumed; ideal for low-volume event apps. Key-based auth is disabled in
  favour of Managed-Identity RBAC (`Cosmos DB Built-in Data Contributor`).
  Containers: `users`, `activities`, `participants`, `scans`, `settings`,
  `organizations`, `memberships`, `events`, `invitations`, `audit_events`.
- **Azure Key Vault** — stores the JWT signing key and optional OAuth client
  secrets.
- User-assigned Managed Identity, assigned the Cosmos data role and Key Vault
  access.
- App Service plan (`B1` Linux) and a single App Service that runs the .NET
  API and serves the SPA bundle from `wwwroot`.
- Log Analytics workspace + Application Insights.

> **Before going live**: provide `Jwt__SigningKey` as a Key Vault reference or
> App Setting (`@Microsoft.KeyVault(SecretUri=…)`). The Bicep leaves it empty
> on purpose — the API refuses to start in non-Development environments
> without an explicit key.

### CI/CD with GitHub Actions

Two workflows are included:

- **`.github/workflows/ci.yml`** — runs on every push/PR: builds the API,
  runs xUnit + Vitest tests, builds the SPA, then runs the Playwright e2e
  suite against a locally-started API.
- **`.github/workflows/deploy.yml`** — runs on `main` (or via
  `workflow_dispatch`): logs in to Azure via OIDC and runs `azd up`.

To enable the deploy workflow, configure the following in your repository
(**Settings → Secrets and variables → Actions → Variables**):

| Variable                | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | App-registration / user-assigned identity client id     |
| `AZURE_TENANT_ID`       | Azure AD tenant id                                      |
| `AZURE_SUBSCRIPTION_ID` | Target subscription id                                  |
| `AZURE_ENV_NAME`        | `azd` environment name (e.g. `onepass-prod`)            |
| `AZURE_LOCATION`        | Region (e.g. `swedencentral`)                           |

Set up a **federated credential** on the app registration for this repository
(subject: `repo:<owner>/<repo>:environment:production`) so `azd auth login
--federated-credential-provider github` can exchange the GitHub OIDC token for
an Azure token without any secret. See
[Microsoft Docs: federated credentials](https://learn.microsoft.com/azure/active-directory/workload-identities/workload-identity-federation-create-trust)
for details.

A smoke test at the end of the deploy job probes the new App Service's
`/health` endpoint to verify the deployment succeeded.

## API overview

### Authentication & identity

| Route                              | Method | Auth   | Notes                              |
| ---------------------------------- | ------ | ------ | ---------------------------------- |
| `/health`                          | GET    | anon   | Liveness probe                     |
| `/api/auth/login`                  | POST   | anon   | Returns JWT                        |
| `/api/auth/register`               | POST   | anon   | Create account                     |
| `/api/auth/forgot-password`        | POST   | anon   | Initiate password reset            |
| `/api/auth/reset-password`         | POST   | anon   | Complete password reset             |
| `/api/auth/check-username`         | GET    | anon   | Username availability check        |
| `/api/auth/providers`              | GET    | anon   | List enabled OAuth providers       |
| `/api/auth/platform-status`        | GET    | anon   | Registration open, maintenance, etc |
| `/api/auth/google`                 | GET    | anon   | Start Google OAuth flow            |
| `/api/auth/microsoft`              | GET    | anon   | Start Microsoft OAuth flow         |
| `/api/auth/me`                     | GET    | user   | Current principal                  |
| `/api/auth/me`                     | PATCH  | user   | Update profile                     |

### User management (platform admin)

| Route                              | Method | Auth   | Notes                              |
| ---------------------------------- | ------ | ------ | ---------------------------------- |
| `/api/users`                       | GET    | admin  | List all users                     |
| `/api/users`                       | POST   | admin  | Create user                        |
| `/api/users/{id}`                  | PATCH  | admin  | Update user                        |
| `/api/users/{id}`                  | DELETE | admin  | Delete user                        |
| `/api/users/{id}/reset-password`   | POST   | admin  | Reset user password                |

### Personal data

| Route                              | Method | Auth   | Notes                              |
| ---------------------------------- | ------ | ------ | ---------------------------------- |
| `/api/me/export`                   | GET    | user   | GDPR data export                   |
| `/api/me`                          | DELETE | user   | Delete own account                 |
| `/api/me/orgs`                     | GET    | user   | List my organizations              |
| `/api/me/active-org`               | POST   | user   | Switch active organization         |

### Organizations, memberships & invitations

| Route                                            | Method | Auth      | Notes                     |
| ------------------------------------------------ | ------ | --------- | ------------------------- |
| `/api/orgs`                                      | POST   | user      | Create organization       |
| `/api/orgs/{orgId}`                              | GET    | member    | Get org details           |
| `/api/orgs/{orgId}`                              | PATCH  | org admin | Update organization       |
| `/api/orgs/{orgId}`                              | DELETE | owner     | Delete organization       |
| `/api/orgs/{orgId}/memberships`                  | GET    | member    | List members              |
| `/api/orgs/{orgId}/memberships/{userId}`         | PATCH  | org admin | Update member role        |
| `/api/orgs/{orgId}/memberships/{userId}`         | DELETE | org admin | Remove member             |
| `/api/orgs/{orgId}/memberships/me`               | PATCH  | member    | Update own membership     |
| `/api/orgs/{orgId}/memberships/me`               | DELETE | member    | Leave organization        |
| `/api/orgs/{orgId}/invitations`                  | GET    | org admin | List invitations          |
| `/api/orgs/{orgId}/invitations`                  | POST   | org admin | Send invitation           |
| `/api/orgs/{orgId}/invitations/{token}/accept`   | POST   | user      | Accept invitation         |
| `/api/orgs/{orgId}/invitations/{token}`          | DELETE | org admin | Revoke invitation         |

### Events & activities

| Route                                            | Method | Auth      | Notes                               |
| ------------------------------------------------ | ------ | --------- | ----------------------------------- |
| `/api/orgs/{orgId}/events`                       | GET    | member    | List events                         |
| `/api/orgs/{orgId}/events/{eventId}`             | GET    | member    | Get event details                   |
| `/api/orgs/{orgId}/events`                       | POST   | org admin | Create event                        |
| `/api/orgs/{orgId}/events/{eventId}`             | PATCH  | org admin | Update event                        |
| `/api/orgs/{orgId}/events/{eventId}`             | DELETE | org admin | Delete event                        |
| `/api/activities`                                | GET    | user      | List activities                     |
| `/api/activities/{id}`                           | GET    | user      | Get activity                        |
| `/api/activities`                                | POST   | admin     | Create activity                     |
| `/api/activities/{id}`                           | PATCH  | admin     | Update activity                     |
| `/api/activities/{id}`                           | DELETE | admin     | Delete activity                     |
| `/api/activities/{id}/reset`                     | POST   | admin     | Reset activity data                 |
| `/api/activities/{id}/participants`              | GET    | user      | List participants                   |
| `/api/activities/{id}/participants`              | POST   | user      | Add participant                     |
| `/api/activities/{id}/participants/{pid}`        | DELETE | user      | Remove participant                  |
| `/api/activities/{id}/scans`                     | POST   | user      | Record scan (409 on duplicate)      |
| `/api/activities/{id}/scans`                     | GET    | user      | List scans                          |
| `/api/activities/{id}/stats`                     | GET    | admin     | Aggregated analytics                |
| `/api/activities/{id}/report.csv`                | GET    | admin     | CSV export                          |

### Platform administration

| Route                                  | Method | Auth            | Notes                       |
| -------------------------------------- | ------ | --------------- | --------------------------- |
| `/api/admin/global/stats`             | GET    | platform admin  | Global statistics           |
| `/api/admin/global/orgs`             | GET    | platform admin  | List all organizations      |
| `/api/admin/global/orgs/{orgId}/status` | POST | platform admin  | Activate / suspend org      |
| `/api/admin/global/settings`         | GET    | platform admin  | View platform settings      |
| `/api/admin/global/settings`         | PUT    | platform admin  | Update platform settings    |

## License

[MIT](./LICENSE) © 2026 François-Xavier Kim
