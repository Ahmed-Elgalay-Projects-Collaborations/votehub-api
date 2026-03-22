# VoteHub API

Secure monolithic Node.js + Express + MongoDB backend for VoteHub.

## Run locally

1. Copy `.env.example` to `.env` and fill secrets.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start development server:
   ```bash
   npm run dev
   ```

## Core API prefixes

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/csrf-token`
- `GET /api/v1/auth/me`
- `GET /api/v1/elections`
- `POST /api/v1/elections` (admin)
- `POST /api/v1/elections/:electionId/votes` (authenticated)
- `GET /api/v1/elections/:electionId/results`
- `GET /api/v1/votes/me`
- `GET /api/v1/votes/elections/:electionId` (admin)

## Metrics

When `ENABLE_METRICS=true`, Prometheus metrics are exposed at `GET /metrics`.

## Auth Mode

- Authentication uses HttpOnly cookie-based JWT by default (`ENABLE_COOKIE_AUTH=true`).
- For state-changing authenticated requests, send `X-CSRF-Token` matching the CSRF cookie/token issued by auth endpoints.
