# OnePass end-to-end tests (Playwright)

These tests drive a real browser against a running OnePass stack — the .NET
API serving the bundled React SPA on a single origin. In production this is a
single Azure App Service; locally, you can point Playwright at either the Vite
dev server or at the API serving its `wwwroot` bundle.

## Install

```pwsh
cd tests/e2e
npm ci
npm run install-browsers   # downloads the Chromium binary
```

## Run locally against the dev servers

Start the API and the Vite dev server in two terminals:

```pwsh
# Terminal 1 — API
cd src/OnePass.Api
$env:ASPNETCORE_ENVIRONMENT="Development"
dotnet run

# Terminal 2 — Web
cd src/OnePass.Web
npm run dev
```

Then from `tests/e2e`:

```pwsh
npm test
```

`BASE_URL` defaults to `http://localhost:5173` (Vite). Override it to point at
any deployed environment:

```pwsh
$env:BASE_URL="https://app-<token>.azurewebsites.net"; npm test
```

## Credentials

The tests use the seed admin account (`admin` / `Devoxx2026!`). Override with
`E2E_ADMIN_USER` and `E2E_ADMIN_PASSWORD` environment variables when testing a
production environment.
