# Rollback + recovery testing (Kubernetes)

These tests verify that failed rollouts do **not** take down availability and that you can roll back quickly.

## 1) Availability during a failed rollout

Deployments in this repo are configured with:

- `maxUnavailable: 0` and `maxSurge: 1`
- readiness probes (traffic only goes to Ready pods)

This means a bad image should **stall** the rollout while the last good ReplicaSet keeps serving traffic.

Suggested test:

1. Run a continuous health check (from inside the cluster or via your Ingress):
   - `curl -fsS https://votehub.example/api/v1/health`
2. Trigger a bad rollout:
   - `kubectl -n votehub set image deployment/api api=votehub-api:does-not-exist`
3. Confirm:
   - `kubectl -n votehub rollout status deployment/api` fails / times out
   - health checks continue to pass (served by old pods)

## 2) Roll back to last known good state

1. `kubectl -n votehub rollout undo deployment/api`
2. `kubectl -n votehub rollout status deployment/api`

## 3) Backup + restore drill (environment-specific)

This project doesn’t assume AWS/S3. Use one of:

- your cloud provider’s **volume snapshots** (CSI snapshotting), or
- a managed database backup feature, or
- a scheduled `mongodump` to a cluster-backed storage target you control.

Minimum restore test (staging):

1. Restore a backup into a staging namespace/cluster.
2. Run smoke tests:
   - `/api/v1/health`
   - login + cast vote flows

