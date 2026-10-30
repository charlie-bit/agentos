---
owner: demo-team
last_verified: 2026-01-05
stale_after: 2027-01-05
status: published
---

# Checkout latency runbook (fictional)

When checkout p95 rises, check the payment retry queue first, then the
database connection pool. Escalate to the platform team if retries exceed
5% of requests for ten minutes.
