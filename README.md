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
