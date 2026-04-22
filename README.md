# VoteHub API

Secure monolithic Node.js + Express + MongoDB backend for VoteHub.

## Production Deployment (DigitalOcean + Atlas)

Use the dedicated runbook:

- [`DEPLOYMENT_DIGITALOCEAN_ATLAS.md`](./DEPLOYMENT_DIGITALOCEAN_ATLAS.md)

It covers:
- backend + frontend deployment flow on DigitalOcean
- MongoDB Atlas setup and hardening
- required production environment variables and secrets
- HTTPS / reverse proxy / metrics / logging expectations
- scaling caveats and disaster recovery checklist

Monitoring files for Prometheus + Alertmanager:
- [`monitoring/`](./monitoring)

Kubernetes (DOKS) manifests:
- [`k8s/digitalocean/`](./k8s/digitalocean)

## Run locally

1. Keep real env files outside the repo workspace (for example: `C:\Users\Ahmed\.votehub-secrets\votehub-api.env`).
2. Load env vars into the current shell (PowerShell):
   ```powershell
   Get-Content "$HOME\.votehub-secrets\votehub-api.env" | ForEach-Object {
     if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
     $name, $value = $_ -split '=', 2
     [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
   }
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start development server:
   ```bash
   npm run dev
   ```

## Docker (API + Web + Mongo)

If you have `votehub-api` and `votehub-web` cloned as sibling folders, you can run the full stack from this repo:

```bash
docker compose -f docker-compose.stack.yml up --build
```

- Web: `http://localhost:5173` (API is reached via Vite proxy, not exposed to host)

## Azure AKS deployment

This repository is ready to deploy to Azure Kubernetes Service while keeping the current MongoDB `StatefulSet`.

Recommended Azure services:
- Azure Container Registry (ACR) for the API image
- Azure Kubernetes Service (AKS) for the cluster
- AKS application routing add-on for public ingress
- Azure managed disks for the MongoDB persistent volume

### 1. Build and push the API image to ACR

```powershell
az acr build --registry <your-acr-name> --image votehub-api:v1 .
```

Then update `k8s/30-api.yaml`:
- `image: your-acr-name.azurecr.io/votehub-api:v1`
- `CLIENT_URL`, `API_BASE_URL`, and `CORS_ORIGINS`
- `host` in `k8s/40-ingress.yaml`

### 2. Create Kubernetes secrets out-of-band

Do not use checked-in secrets for production.

Use the examples in:
- `k8s/secrets/api-secrets.example.env`
- `k8s/secrets/mongo-secrets.example.env`

Then create the actual secrets:

```powershell
kubectl apply -f k8s/00-namespace.yaml

kubectl create secret generic votehub-api-secrets `
  -n votehub `
  --from-env-file=k8s/secrets/api-secrets.prod.env

kubectl create secret generic votehub-mongo-secrets `
  -n votehub `
  --from-env-file=k8s/secrets/mongo-secrets.prod.env

kubectl create secret generic votehub-mongo-tls `
  -n votehub `
  --from-file=ca.crt=path/to/ca.crt `
  --from-file=tls.pem=path/to/tls.pem

kubectl create secret tls votehub-api-tls `
  -n votehub `
  --cert=path/to/fullchain.crt `
  --key=path/to/tls.key
```

### 3. Apply the manifests

```powershell
kubectl apply -f k8s/20-mongo.yaml
kubectl apply -f k8s/30-api.yaml
kubectl apply -f k8s/40-ingress.yaml
kubectl apply -f k8s/60-hpa.yaml
kubectl apply -f k8s/70-pdb.yaml
kubectl apply -f k8s/80-networkpolicy.yaml
```

### 4. Azure-specific notes

- `TRUST_PROXY=2` is set for AKS because requests pass through the ingress controller and the pod-level NGINX proxy before reaching Express.
- MongoDB storage is pinned to `managed-csi-premium` for Azure managed disks.
- The ingress manifest expects the AKS application routing ingress class: `webapprouting.kubernetes.azure.com`.
- `LOG_TO_FILE=false` is recommended in containers so logs go to stdout/stderr for Azure log collection.

## Testing

Functional/API tests are implemented with:
- `mocha` (test runner)
- `supertest` (HTTP assertions for Express routes)
- `chai` (assertions)
- `mongodb-memory-server` (isolated in-memory MongoDB for deterministic integration tests)

Run tests:
```bash
npm install
npm test
```

Watch mode:
```bash
npm run test:watch
```

Notes:
- Tests run against an isolated in-memory database and do not require your development Mongo instance.
- No production SMTP/services are required for tests.
- On first run, `mongodb-memory-server` may download MongoDB binaries depending on your environment/CI cache.
- Alpine Linux is not supported by `mongodb-memory-server`. On Alpine, run tests with a dedicated external test DB:
  ```bash
  TEST_MONGO_URI=mongodb://mongo:27017/votehub_test npm test
  ```
  Use a test-only database name. Test bootstrap clears collections between tests.

## Core API prefixes

- `GET /api/v1/health`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `POST /api/v1/auth/register`
- `GET /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/otp/verify-login`
- `POST /api/v1/auth/otp/setup`
- `POST /api/v1/auth/otp/verify-setup`
- `POST /api/v1/auth/otp/disable`
- `POST /api/v1/auth/admin/step-up` (admin)
- `GET /api/v1/auth/admin/audit/verify` (admin + step-up)
- `PATCH /api/v1/auth/admin/users/:userId/poll-permission` (admin + step-up)
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/csrf-token`
- `GET /api/v1/auth/me`
- `GET /api/v1/elections`
- `POST /api/v1/elections` (poll creators, admin)
- `PATCH /api/v1/elections/:electionId` (poll creators for own polls, admin for all)
- `PATCH /api/v1/elections/:electionId/status` (poll creators for own polls, admin for all)
- `DELETE /api/v1/elections/:electionId` (poll creators for own polls, admin for all)
- `POST /api/v1/elections/:electionId/votes` (authenticated)
- `GET /api/v1/elections/:electionId/results`
- `GET /api/v1/votes/me`
- `GET /api/v1/votes/elections/:electionId` (admin + step-up)
- `POST /api/v1/votes/receipts/verify`

## Metrics

When `ENABLE_METRICS=true`, Prometheus metrics are exposed at `GET /metrics`.

## Auth Mode

- Authentication uses HttpOnly cookie-based JWT by default (`ENABLE_COOKIE_AUTH=true`).
- For state-changing authenticated requests, send `X-CSRF-Token` matching the CSRF cookie/token issued by auth endpoints.
- Email verification is required before login is completed.
- OTP is optional for normal users and mandatory for admin users.
- Admin-sensitive operations require one-time `X-Admin-Step-Up-Token` from `POST /auth/admin/step-up`.
- Poll creation is permission-based: admins can grant/revoke `canCreatePolls` for voters via `PATCH /auth/admin/users/:userId/poll-permission`.
- Users with poll permission can create/manage only polls they own; admins can manage all polls.
- Votes are stored with encrypted selections at rest and return signed receipts on successful casting.
