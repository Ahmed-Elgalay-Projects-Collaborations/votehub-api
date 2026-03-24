# VoteHub API Security Features

This document lists the security controls currently implemented in the VoteHub backend.

## Architecture-Level Security
- Monolithic Express API with centralized middleware stack.
- Centralized request context using `X-Request-Id` for traceability.
- Centralized error normalization and safe API error responses.
- Separate logging channels for application logs and security logs.

## HTTP and Transport Hardening
- `helmet` enabled for secure HTTP headers.
- `x-powered-by` header disabled.
- `trust proxy` configured for proxy-aware request handling.
- CORS allowlist enforcement via configured origins.
- Credentialed CORS support for cookie-based auth mode.
- `compression` enabled.
- Global API rate limiting middleware for abuse reduction.

## Input Safety and Request Sanitization
- Request body size limit (`BODY_LIMIT`).
- Input validation using `express-validator`.
- Validation error responses are structured and centralized.
- XSS sanitization across `body`, `query`, and `params`.
- NoSQL injection mitigation with `express-mongo-sanitize`.
- HTTP parameter pollution mitigation with `hpp`.
- Forbidden prototype pollution keys are filtered (`__proto__`, `prototype`, `constructor`).

## Authentication and Session Security
- JWT-based authentication (`jsonwebtoken`).
- Cookie-based auth mode enabled by default (`HttpOnly` auth cookie).
- Optional Bearer token support for non-cookie mode.
- Configurable auth token expiration.
- Email verification required before protected access.
- Account activity check (`isActive`) on authenticated access.
- User context hydration on protected routes.

## CSRF Protection Model
- Origin/Referer allowlist checks for state-changing requests.
- `sec-fetch-site` cross-site hardening for header-token requests.
- Double-submit CSRF protection in cookie-auth mode.
- CSRF token cookie + required `X-CSRF-Token` header match.
- Controlled route exemptions for login/registration/challenge flows.

## Authorization Controls
- Role-based access control (`voter`, `admin`).
- Route-level role enforcement for admin-only endpoints.
- Permission-based poll builder authorization (`canCreatePolls`) managed by admins.
- Object-level restrictions for user-specific resources where applicable.
- Election mutation routes enforce ownership for non-admin poll creators (`createdBy` must match authenticated user).
- Email-verified gate enforced before sensitive access.

## MFA / OTP Security
- TOTP using authenticator apps (`otplib`).
- OTP optional for normal users.
- OTP mandatory for admin users.
- Admin users cannot disable OTP.
- OTP challenge token flow for multi-step login.
- OTP setup enrollment with QR and manual key.
- Recovery codes generated and stored as hashes.
- OTP failure rate limiting and lock window.

## Admin Step-Up Authentication
- Admin step-up endpoint requiring password + OTP/recovery code.
- One-time admin step-up JWT (`x-admin-step-up-token`) for sensitive actions.
- Step-up token bound to admin subject and short expiration.
- Step-up replay prevention via one-time token consumption.
- Sensitive admin mutation routes require step-up.
- Admin permission-grant operation for poll creation (`PATCH /auth/admin/users/:userId/poll-permission`) requires step-up.

## Login Abuse and Account Lockout
- Login abuse guard on login endpoint.
- Progressive lockout penalties after repeated failed attempts.
- IP and IP+email attempt tracking.
- Stricter threshold behavior for admin-targeted attempts.
- Lock window and max lock duration are configurable.

## Risk-Based Authentication and Threat Scoring
- In-memory security event scoring engine.
- Weighted scoring for suspicious security events.
- Risk decay over time.
- Risk thresholds (`medium`, `high`, `critical`) configurable.
- Risk-based login escalation can force OTP challenge.
- Temporary risk blocks with retry-after behavior.

## Replay Attack Protection
- Reusable one-time token store (`UsedToken`) with TTL cleanup.
- Replay checks for OTP challenge tokens.
- Replay checks for email verification flow.
- Replay checks for admin step-up tokens.
- Optional idempotency token support for vote submission replay resistance.

## Email Verification Security
- Verification tokens generated with cryptographically random values.
- Token hashes stored instead of raw token values.
- Expiration and one-time semantics enforced.
- Resend flow avoids user enumeration by returning safe generic messaging.
- Suspicious token usage events are logged as security events.

## Voting Integrity Controls
- One voter per election enforced by unique DB index (`election + voter`).
- Server-side election state checks before accepting votes.
- Voting window checks (`startsAt`/`endsAt`) enforced.
- Option set validation and selection limit enforcement.
- Duplicate submission handling with conflict response.
- Vote rejection events logged with reason metadata.

## Vote Confidentiality and Receipt Integrity
- Vote selections encrypted at rest using AES-256-GCM.
- Encryption keys sourced from environment variables.
- Vote receipt generation with signed integrity payloads.
- Receipt verification endpoint with signature and payload checks.
- Receipt verification enforces ownership rules for non-admin users.

## Election Lifecycle Integrity
- Strict election lifecycle transitions are enforced server-side.
- Allowed transitions are: `draft -> published|archived`, `published -> open|archived`, `open -> closed|archived`, `closed -> archived`.
- Invalid transitions are rejected server-side.
- Critical election fields locked after election is open.
- Closed/archived elections cannot be edited through update endpoints.
- Admin lifecycle actions are audited.

## Audit and Forensic Evidence
- Tamper-evident audit log model with hash chaining.
- Each audit entry includes `previousHash` and `currentHash`.
- Critical admin actions include integrity signature.
- Append-only protection on audit log updates/deletes.
- Audit chain verification endpoint for integrity checks.

## Logging and Sensitive Data Protection
- Application logs and security logs are separated.
- Security event logging includes request and actor context.
- Metrics and audit logging are fed from centralized security events.
- Sensitive values are redacted in logs (`password`, token-like keys, secrets).
- Stack traces are only logged internally for server errors.

## Honeypot / Probe Detection
- Suspicious path probe detection (`/wp-admin`, `/phpmyadmin`, `/.env`, etc.).
- Honeypot field/header trap detection.
- Honeypot triggers produce security events and can contribute to risk scoring.

## Observability and Metrics Security
- Prometheus metrics endpoint (`/metrics`) behind feature toggle.
- Default process metrics collected.
- Security-focused custom metrics include login outcomes, OTP outcomes, email verification outcomes, rate-limit triggers, unauthorized/forbidden access counts, suspicious event counts, risk blocks, vote submission success/failure, and HTTP `401`/`403`/`429` counters.

## Data and Secret Configuration Controls
- Production checks enforce required strong secrets for critical keys.
- Cookie `SameSite=None` requires `Secure=true`.
- OTP/vote encryption keys are environment-driven.
- Audit and receipt signing keys are environment-driven.

## Known Operational Caveats
- Risk scoring and lockout tracking are in-memory and instance-local.
- Audit append ordering is serialized per process, not distributed globally.
- `/metrics` exposure control must be enforced by infrastructure.
- Security posture in production depends on strong secret management and TLS at deployment layer.
