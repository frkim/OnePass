# OnePass

OnePass is a web-based platform for tracking participant activity via badge / QR
scanning. Admins manage events, Users scan participants, and Participants simply
present a QR code — no account required.

The whole stack runs on a **single Azure App Service** and a **serverless Azure
Cosmos DB** account: one origin, no CORS, minimal cost.

| Layer          | Technology                                                       |
| -------------- | ---------------------------------------------------------------- |
| Frontend       | React 19 + TypeScript 5.9 + Vite 6, PWA, i18next (EN/FR)         |
| Backend        | ASP.NET Core 10 Web API (C#), JWT auth, xUnit tests              |
| Data           | Azure Cosmos DB for NoSQL (serverless) — in-memory fallback for dev |
| Identity       | Azure Managed Identity (User-Assigned) in production             |
| Infrastructure | Bicep + Azure Developer CLI (`azd`)                              |
| Observability  | Log Analytics + Application Insights                             |
| Hosting        | Single Linux App Service serves both the API and the bundled SPA |
| CI/CD          | GitHub Actions (build + unit + e2e) and `azd up` deploy          |

## Repository layout

```
.
├── azure.yaml                  # Azure Developer CLI service definition (single service)
├── infra/                      # Bicep templates (subscription-scope main + resources)
├── .github/workflows/          # CI + deployment pipelines
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

- **Single-origin hosting** — the .NET API serves the bundled React SPA from
  `wwwroot` and falls back to `index.html` for client-side routes. One App
  Service, one URL, no CORS surface in production.
- **Role-based access control** — built-in roles `Admin` and `User`.
  Participants are data-only and never authenticate.
- **Activities, participants, scans** — full CRUD for activities, automatic
  participant registration on first scan, one-scan-per-participant policy with
  duplicate detection (surfaced to the UI with the timestamp of the previous
  scan).
- **Reporting & analytics** — admin dashboard with totals and per-day scan
  chart (chart.js), plus CSV export of raw scan data.
- **Data retention** — background service archives scan records older than the
  configured retention window (30 days by default).
- **Internationalization** — English and French bundled; add new languages by
  dropping another JSON bundle into `src/OnePass.Web/src/i18n/`.
- **PWA + offline scanning** — installable manifest, service worker with a
  `NetworkFirst` cache for `GET /api/*`, and a `localStorage` scan queue that
  auto-flushes when the browser reports it is back online.
- **Responsive UI** — works on desktop and mobile; tables scroll horizontally
  inside cards on narrow viewports so action buttons remain reachable.

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

On first run the API seeds a local admin: `admin` / `Devoxx2026!`. **Change or
remove this seed before exposing the API publicly.**

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

# Frontend (vitest)
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

| Key                          | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `Jwt:SigningKey`             | HMAC signing key. **Required** in non-dev environments.     |
| `Jwt:ExpirationMinutes`      | Token lifetime (default 60).                                |
| `Cosmos:Endpoint`            | Cosmos DB account endpoint (auth via Managed Identity).     |
| `Cosmos:ConnectionString`    | Fallback connection string if no endpoint is set.           |
| `Cosmos:DatabaseName`        | Database name (default `onepass`).                          |
| `Retention:RetentionDays`    | Days to keep scan data before archiving (default 30).       |
| `Retention:CheckIntervalHours` | How often the retention sweep runs (default 6 h).         |
| `Cors:Origins`               | Allowed frontend origins (same-origin by default).          |

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
- User-assigned Managed Identity, assigned the Cosmos data role
- App Service plan (`B1` Linux) and a single App Service that runs the .NET
  API and serves the SPA bundle from `wwwroot`
- Log Analytics workspace + Application Insights

> **Before going live**: provide `Jwt__SigningKey` as a Key Vault reference or
> App Setting (`@Microsoft.KeyVault(SecretUri=…)`). The Bicep leaves it empty
> on purpose — the API refuses to start in non-Development environments
> without an explicit key.

### CI/CD with GitHub Actions

Two workflows are included:

- **`.github/workflows/ci.yml`** — runs on every push/PR: builds the API,
  runs xUnit + vitest tests, builds the SPA, then runs the Playwright e2e
  suite against a locally-started API.
- **`.github/workflows/deploy.yml`** — runs on `main` (or via
  `workflow_dispatch`): logs in to Azure via OIDC and runs `azd up`.

To enable the deploy workflow, configure the following in your repository
(**Settings → Secrets and variables → Actions → Variables**):

| Variable                | Description                                                       |
| ----------------------- | ----------------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | App-registration / user-assigned identity client id               |
| `AZURE_TENANT_ID`       | Azure AD tenant id                                                |
| `AZURE_SUBSCRIPTION_ID` | Target subscription id                                            |
| `AZURE_ENV_NAME`        | `azd` environment name (e.g. `onepass-prod`)                      |
| `AZURE_LOCATION`        | Region (e.g. `swedencentral`)                                     |

Set up a **federated credential** on the app registration for this repository
(subject: `repo:<owner>/<repo>:environment:production`) so `azd auth login
--federated-credential-provider github` can exchange the GitHub OIDC token for
an Azure token without any secret. See
[Microsoft Docs: federated credentials](https://learn.microsoft.com/azure/active-directory/workload-identities/workload-identity-federation-create-trust)
for details.

A smoke test at the end of the deploy job probes the new App Service's
`/health` endpoint to verify the deployment succeeded.

## API overview

| Route                                   | Method | Auth    | Notes                                        |
| --------------------------------------- | ------ | ------- | -------------------------------------------- |
| `/health`                               | GET    | anon    | Liveness probe                               |
| `/api/auth/login`                       | POST   | anon    | Returns JWT                                  |
| `/api/auth/register`                    | POST   | anon    | Create a standard User                       |
| `/api/auth/me`                          | GET    | user    | Current principal                            |
| `/api/auth/usernames`                   | GET    | anon    | Autocomplete hint for login                  |
| `/api/users`                            | GET/POST/DELETE | Admin | Manage accounts                        |
| `/api/activities`                       | GET    | user    | List activities                              |
| `/api/activities`                       | POST   | Admin   | Create activity                              |
| `/api/activities/{id}/participants`     | GET/POST | user  | Manage per-activity participants             |
| `/api/activities/{id}/scans`            | POST   | user    | Record a scan (409 on duplicate, includes previousScannedAt) |
| `/api/activities/{id}/scans`            | GET    | user    | List scans                                   |
| `/api/activities/{id}/stats`            | GET    | Admin   | Aggregated analytics                         |
| `/api/activities/{id}/report.csv`       | GET    | Admin   | CSV export                                   |

## License

See [LICENSE](./LICENSE).
# OnePass

OnePass is a web-based platform for tracking participant activity via badge / QR
scanning. Admins manage events, Users scan participants, and Participants simply
present a QR code — no account required.

This repository contains the full-stack initial implementation:

| Layer          | Technology                                           |
| -------------- | ---------------------------------------------------- |
| Frontend       | React 19 + TypeScript 5.9 + Vite 6, PWA, i18next (EN/FR) |
| Backend        | ASP.NET Core 8 Web API (C#), JWT auth, xUnit tests   |
| Data           | Azure Table Storage (with in-memory fallback for dev)|
| Identity       | Azure Managed Identity (User-Assigned) in production |
| Infrastructure | Bicep + Azure Developer CLI (`azd`)                  |
| Observability  | Log Analytics + Application Insights                 |

## Repository layout

```
.
├── azure.yaml                  # Azure Developer CLI service definition
├── infra/                      # Bicep templates (subscription-scope main + resources)
├── src/
│   ├── OnePass.sln
│   ├── OnePass.Api/            # ASP.NET Core Web API
│   ├── OnePass.Api.Tests/      # xUnit unit tests
│   └── OnePass.Web/            # React + Vite frontend (PWA)
└── README.md
```

## Features

- **Role-based access control** — built-in roles `Admin` and `User` (extensible).
  Participants are data-only and never authenticate.
- **Activities, participants, scans** — full CRUD for activities, participant
  registration per activity, and QR scan recording enforcing
  `MaxScansPerParticipant` and the activity time window.
- **Reporting & analytics** — admin dashboard with totals and per-day scan
  chart (chart.js), plus CSV export of raw scan data.
- **Data retention** — background service archives scan records older than the
  configured retention window (30 days by default) to help meet GDPR-style
  obligations. Configurable via `Retention:RetentionDays`.
- **Internationalization** — English and French shipped; add new languages by
  dropping another JSON bundle into `src/OnePass.Web/src/i18n/`. Dates format
  per-locale via `Intl.DateTimeFormat`.
- **PWA + offline scanning** — installable manifest, service worker with a
  `NetworkFirst` cache for `GET /api/*`, and a `localStorage` scan queue that
  auto-flushes when the browser reports it is back online.
- **Responsive UI** — CSS-grid based layout tested on desktop and mobile
  viewports.

## Prerequisites

- [.NET SDK 8.0+](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) and npm
- [Azure Developer CLI (`azd`)](https://aka.ms/azd) for deployment
- An Azure subscription for deployment (optional for local dev)

## Running locally

### Backend

```bash
cd src/OnePass.Api
dotnet run
# API listens on http://localhost:5248
# Scalar API docs at http://localhost:5248/scalar
```

On first run in the `Development` environment the API seeds a local admin
user: `admin@onepass.local` / `ChangeMe123!`. Change or remove this before
exposing the API. Without `Storage:TableEndpoint` or `Storage:ConnectionString`
the API uses an in-memory table store (not persisted between runs).

### Frontend

```bash
cd src/OnePass.Web
npm install
npm run dev
# Vite dev server at http://localhost:5173 (proxies /api to the API)
```

### Tests

```bash
# Backend
dotnet test src/OnePass.sln

# Frontend
cd src/OnePass.Web && npm test
```

## Configuration (backend)

All settings live in `src/OnePass.Api/appsettings.json` and can be overridden
via environment variables using the `__` separator (e.g.
`Jwt__SigningKey`).

| Key                          | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `Jwt:SigningKey`             | HMAC signing key. **Required** in non-dev environments.     |
| `Jwt:ExpirationMinutes`      | Token lifetime (default 60).                                |
| `Storage:TableEndpoint`      | Azure Table Storage endpoint (uses Managed Identity).       |
| `Storage:ConnectionString`   | Fallback connection string if no endpoint is set.           |
| `Retention:RetentionDays`    | Days to keep scan data before archiving (default 30).       |
| `Retention:CheckIntervalHours` | How often the retention sweep runs (default 6 h).         |
| `Cors:Origins`               | Allowed frontend origins.                                    |

## Deploying to Azure

The repository is ready for the Azure Developer CLI:

```bash
azd auth login
azd up
```

`azd up` provisions:

- Resource group
- Azure Storage account (Table service, Managed-Identity-only access)
- User-assigned Managed Identity (assigned `Storage Table Data Contributor`)
- App Service plan + two Linux App Services (`api` for .NET, `web` for Node)
- Log Analytics workspace + Application Insights

> **Before going live**: provide `Jwt__SigningKey` as a Key Vault reference or
> App Setting. The Bicep leaves it empty intentionally so the application
> refuses to start without an explicit value in production.

## API overview

| Route                                   | Method | Auth         | Notes                                |
| --------------------------------------- | ------ | ------------ | ------------------------------------ |
| `/health`                               | GET    | anonymous    | Liveness probe                       |
| `/api/auth/login`                       | POST   | anonymous    | Returns JWT                          |
| `/api/auth/me`                          | GET    | any user     | Current principal                    |
| `/api/users`                            | GET/POST/DELETE | Admin | Manage accounts                      |
| `/api/activities`                       | GET    | any user     | List activities                      |
| `/api/activities`                       | POST   | Admin        | Create activity                      |
| `/api/activities/{id}/participants`     | GET/POST | any user   | Manage per-activity participants     |
| `/api/activities/{id}/scans`            | POST   | any user     | Record a scan                        |
| `/api/activities/{id}/scans`            | GET    | any user     | List scans                           |
| `/api/activities/{id}/stats`            | GET    | Admin        | Aggregated analytics                 |
| `/api/activities/{id}/report.csv`       | GET    | Admin        | CSV export                           |

## License

See [LICENSE](./LICENSE).
