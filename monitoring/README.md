# Monitoring Stack (Prometheus + Alertmanager)

This folder configures Prometheus scraping and alerting for VoteHub security/abuse metrics.

## Files

- `prometheus.yml` - scrape config and Alertmanager target
- `alerts.yml` - alert rules for login/rate-limit/suspicious/risk/vote rejection patterns
- `alertmanager.yml` - Alertmanager routing (default null receiver; update for Slack/Email/Webhook)

## Required Secret

Prometheus uses a bearer token to scrape `/metrics`.

1. Copy `monitoring/secrets/metrics_token.example` to `monitoring/secrets/metrics_token`
2. Put the exact same value as backend `METRICS_TOKEN` in the file
3. Keep file permissions restricted

## Access

With `docker-compose.digitalocean.yml`:
- Prometheus UI: `http://127.0.0.1:9090`
- Alertmanager UI: `http://127.0.0.1:9093`

Both are bound to loopback only by default.
