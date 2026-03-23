# VoteHub Deployment Runbook (DigitalOcean Kubernetes + MongoDB Atlas)

This runbook deploys VoteHub on **DOKS** using:
- `votehub-api` (backend)
- `votehub-web` (frontend)
- Prometheus + Alertmanager (in-cluster)
- MongoDB Atlas (managed DB)

## 1. Architecture

- Public traffic enters **NGINX Ingress Controller**.
- Ingress routes to `web` service.
- `web` pod runs NGINX and proxies `/api/*` to `api:3100`.
- `api` pod connects to MongoDB Atlas via `MONGO_URI`.
- Prometheus scrapes `api:3100/metrics` with bearer token.
- Alertmanager receives alerts from Prometheus.

Where NGINX exists:
- Ingress NGINX controller (cluster edge).
- Frontend NGINX inside `votehub-web` container.

## 2. Prerequisites

- DOKS cluster created and `kubectl` configured.
- Atlas cluster ready (TLS enabled by Atlas default).
- Domain DNS ready (`votehub.example.com`).
- TLS cert/key files ready for ingress secret.

## 3. Build and Push Images

Build/push backend image:

```bash
cd votehub-api
docker build -t ghcr.io/your-org/votehub-api:latest .
docker push ghcr.io/your-org/votehub-api:latest
```

Build/push frontend image:

```bash
cd ../votehub-web
docker build -t ghcr.io/your-org/votehub-web:latest .
docker push ghcr.io/your-org/votehub-web:latest
```

Update image fields in:
- `votehub-api/k8s/digitalocean/20-api-deployment.yaml`
- `votehub-web/k8s/digitalocean/10-web-deployment.yaml`

If images are private, create and reference an image pull secret in both deployments.

```bash
kubectl create secret docker-registry ghcr-credentials \
  -n votehub \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-pat-with-read-packages> \
  --dry-run=client -o yaml | kubectl apply -f -
```

## 4. Install NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
kubectl rollout status deployment/ingress-nginx-controller -n ingress-nginx --timeout=180s
kubectl get svc ingress-nginx-controller -n ingress-nginx
```

Wait until `EXTERNAL-IP` is assigned on `ingress-nginx-controller`.

## 5. Install Metrics Server (Required for HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl rollout status deployment/metrics-server -n kube-system --timeout=180s
kubectl top nodes
```

## 6. Prepare Secrets

Backend secret file:

```bash
cd votehub-api
cp k8s/digitalocean/secrets/api-secrets.example.env k8s/digitalocean/secrets/api-secrets.prod.env
```

Monitoring secret file:

```bash
cp k8s/digitalocean/secrets/monitoring-secrets.example.env k8s/digitalocean/secrets/monitoring-secrets.prod.env
```

Important:
- Set `MONGO_URI` to Atlas connection string.
- `metrics_token` must match backend `METRICS_TOKEN`.
- Fill all crypto/auth/smtp secrets.

Create namespace and secrets:

```bash
kubectl apply -f k8s/digitalocean/00-namespace.yaml

kubectl create secret generic votehub-api-secrets \
  -n votehub \
  --from-env-file=k8s/digitalocean/secrets/api-secrets.prod.env

kubectl create secret generic votehub-monitoring-secrets \
  -n votehub \
  --from-env-file=k8s/digitalocean/secrets/monitoring-secrets.prod.env

kubectl create secret tls votehub-tls \
  -n votehub \
  --cert=path/to/fullchain.crt \
  --key=path/to/tls.key
```

## 7. Apply Backend + Monitoring Manifests

```bash
kubectl apply -k k8s/digitalocean
```

This deploys:
- API Deployment/Service/HPA/PDB
- Prometheus Deployment/Service + rules/config
- Alertmanager Deployment/Service + config
- PVCs for Prometheus and Alertmanager (`do-block-storage`)

## 8. Apply Frontend Manifests

```bash
cd ../votehub-web
kubectl apply -k k8s/digitalocean
```

This deploys:
- Web Deployment/Service/HPA/PDB
- Public Ingress (`votehub.example.com`)

## 9. Verify Deployment

```bash
kubectl get pods -n votehub
kubectl get svc -n votehub
kubectl get ingress -n votehub
kubectl get svc -n ingress-nginx
```

Smoke checks:
- `https://votehub.example.com/nginx-health`
- `https://votehub.example.com/api/v1/health/live`
- `https://votehub.example.com/api/v1/health/ready`
- Login + vote flow

## 10. Access Prometheus and Alertmanager

Port-forward locally:

```bash
kubectl port-forward -n votehub svc/prometheus 9090:9090
kubectl port-forward -n votehub svc/alertmanager 9093:9093
```

Then open:
- `http://localhost:9090`
- `http://localhost:9093`

## 11. Alertmanager Notifications

Current `alertmanager.yml` uses a null receiver by default.

Before production cutover, update:
- `votehub-api/k8s/digitalocean/60-alertmanager-configmap.yaml`

Add real receivers (Slack/Email/Webhook), then re-apply:

```bash
kubectl apply -f k8s/digitalocean/60-alertmanager-configmap.yaml
kubectl rollout restart deploy/alertmanager -n votehub
```

## 12. Security / Operations Checklist

- Keep secrets in K8s secrets (not git).
- `NODE_ENV=production`, secure cookies, HTTPS enforced.
- Restrict Atlas IP access to cluster egress.
- Scrape `/metrics` with token auth only.
- Centralize application logs from container stdout.
- Rotate secrets after incidents and periodically.
- Disaster recovery: test Atlas restore + app redeploy on schedule.

## 13. Known Limitation

Risk scoring and lockout state remain in-memory in backend process.
For multi-instance consistency, move these to Redis/shared storage.
