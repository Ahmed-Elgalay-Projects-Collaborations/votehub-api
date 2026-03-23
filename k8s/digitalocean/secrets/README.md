Copy the example files to non-committed `.env` files in this folder, then create Kubernetes secrets:

```bash
kubectl apply -f k8s/digitalocean/00-namespace.yaml

kubectl create secret generic votehub-api-secrets \
  -n votehub \
  --from-env-file=k8s/digitalocean/secrets/api-secrets.prod.env

kubectl create secret generic votehub-monitoring-secrets \
  -n votehub \
  --from-env-file=k8s/digitalocean/secrets/monitoring-secrets.prod.env
```

Do not commit real secret files.
