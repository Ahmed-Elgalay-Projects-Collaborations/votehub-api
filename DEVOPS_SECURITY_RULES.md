# VoteHub DevOps Security Rules

## Shared DevOps Rules

- Keep all secrets out of Git repositories, Docker images, and plaintext deployment manifests.
- Use `.env.example` files only as templates; never commit real `.env` values.
- Store production secrets in GitHub Secrets, Kubernetes Secrets, or the cloud provider's secret storage.
- Run `gitleaks`, `npm audit`, CI checks, and CodeQL before approving deployments.
- Allow deployments only from reviewed branches and protected CI/CD workflows.
- Prefer immutable container image digests over mutable tags in production releases.
- Enforce HTTPS/TLS for all public traffic and administrative access.
- Keep dependency updates active through Dependabot and patch critical vulnerabilities quickly.
- Restrict infrastructure access with least-privilege roles and separate developer/admin permissions.
- Keep rollback, backup, and restore procedures documented and tested regularly.
- The use of Nginx for Content Security Policy (CSP) has been hardened to remove 'unsafe-inline'

## Frontend DevOps Rules

- Deploy the frontend from `votehub-web` only after lint, build, and security checks pass.
- Treat all `VITE_*` variables as public build-time values; never place secrets in frontend environment variables.
- Keep `votehub-web/.env.example` as the reference file and avoid committing local runtime `.env` files.
- Serve the frontend through Nginx with HTTPS enabled and secure headers preserved.
- Do not weaken CSP, clickjacking protection, or cookie-related security settings without security review.
- Keep the frontend image minimal and ship only compiled static assets to production.
- Route `/api` traffic only to the approved backend service or approved public API origin.
- Use trusted ingress hosts and valid TLS certificates for production domains.
- Keep GitHub Actions deployment credentials in repository secrets, not in workflow files.
- Validate readiness and smoke-test the frontend after each deployment before promoting release status.

## Backend DevOps Rules

- Deploy the backend from `votehub-api` only after tests, CI checks, and security scans pass.
- Keep API secrets, database credentials, JWT keys, CSRF settings, and metrics tokens outside the repository.
- Use Kubernetes Secrets or managed secret storage for runtime configuration instead of hardcoded values.
- Keep `votehub-api/.env.example` as the template and never commit production `.env` files.
- Enforce secure defaults in production, including `helmet`, CORS allowlists, rate limiting, CSRF protection, and OTP policies.
- Keep MongoDB access restricted to trusted networks, authenticated clients, and encrypted connections.
- Preserve Kubernetes NetworkPolicy controls so the API and database are not exposed unnecessarily.
- Protect monitoring endpoints and bearer tokens, and avoid exposing Prometheus or Alertmanager publicly by default.
- Use readiness probes, controlled rolling updates, and documented rollback steps for every production release.
- Log security-relevant events, but never write passwords, tokens, OTP codes, or other secrets to logs.
- Back up the database regularly and perform restore drills in a safe non-production environment.
- Review admin-only routes and privileged deployment changes with stricter approval than normal application changes.
