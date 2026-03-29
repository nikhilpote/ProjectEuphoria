---
name: Euphoria LiveOps & Trivia Architecture
description: Feature flags service structure, trivia module design, and key conventions established during implementation
type: project
---

Feature flags table exists in 001_initial_schema.sql (with id, key, value TEXT, description, updated_at, updated_by). Migration 003 seeds default flag values. The service (apps/api/src/modules/feature-flags/) is already implemented with Redis cache-first, DB fallback pattern (TTL 60s, prefix ff:). FeatureFlagsService exports getBool/getNumber/getString typed helpers and getAll(keys?) for filtered subsets.

Admin flag endpoints live at /admin/flags (GET all, GET :key, PUT :key) on AdminFeatureFlagsController. Public safe flags at GET /flags/public (no auth) via PublicFeatureFlagsController. Legacy GET /feature-flags kept for backward compat. All three controllers are in the same feature-flags.controller.ts file registered in FeatureFlagsModule.

Trivia questions table (trivia_questions) added in migration 004 — NOT inside game_definitions (those are show-round configs with encrypted answers). trivia_questions is a standalone catalog for PlayClips/practice mode with correct_index stored server-side only.

TriviaService injects FeatureFlagsService for trivia_time_limit_ms. Points curve: <=50% of time window = 1000pts, 50-80% = 500pts, 80-100% = 250pts, over limit = 0.

validate endpoint captures serverReceivedAt = Date.now() at the top of the controller handler (before any async work) and compares against clientTimestamp in the body. clientTimestamp is advisory — correctness is determined server-side only.

GamesModule at apps/api/src/modules/games/ is a barrel that imports TriviaModule. Add future mini-game modules here.

**Why:** LiveOps foundation needed before show engine work so game params can be tuned without deploys.
**How to apply:** Any new game module goes under apps/api/src/modules/games/ and gets imported into GamesModule. Any new runtime-tunable param should be a feature flag, not an env var.
