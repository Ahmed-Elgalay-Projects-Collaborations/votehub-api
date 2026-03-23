Copy the example files to non-committed `.env` files in this folder, then create the Kubernetes secrets before applying the workload manifests.

```powershell
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
```

Do not commit the real `.env` or certificate files.
