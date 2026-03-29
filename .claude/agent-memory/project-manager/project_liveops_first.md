---
name: LiveOps Baked In From Phase 1
description: Architectural decision that LiveOps tooling (feature flags, remote config, admin APIs, monitoring) must be built in Phase 1, not deferred
type: project
---

LiveOps infrastructure is required from Phase 1, not treated as a later afterthought. This is a deliberate product decision.

**P1 LiveOps scope:**
- Feature flag service (P1-T06): per-user and global flags, Redis cache, admin API
- Remote config service (P1-T07): key-value store, version hash for client diffing, admin update endpoint
- Structured logging to CloudWatch (P1-T08)
- AWS X-Ray tracing (P1-T09)

**P2 adds:** CloudWatch custom metrics + dashboard, alerting (P2-T11), admin show management API (P2-T09), host controls (P2-T10)

**P4 matures:** Analytics pipeline (P4-T10 through P4-T12), alert runbook (P4-T15), feature flag editor in admin dashboard (P4-T25), show scheduling automation (P4-T14)

**Why:** The CEO demo at M4 specifically shows a product change (elimination rate) being pushed live via feature flags without a deploy. LiveOps readiness is a confidence signal, not a nice-to-have. Retrofitting this in P3+ would require rearchitecting client config fetch and admin tooling.

**How to apply:** If any planning discussion suggests deferring feature flags, remote config, or monitoring to a later phase, push back citing this decision and its demo implications.
