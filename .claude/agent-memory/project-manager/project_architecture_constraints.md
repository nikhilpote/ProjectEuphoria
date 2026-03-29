---
name: Euphoria Architecture Constraints
description: Key architectural decisions and constraints from the project plan that affect future task design
type: project
---

These are load-bearing architectural constraints established in the Phase 1-2 design. Violating them would require rework.

**WebSocket:**
- Socket.IO with Redis adapter from P2 day one (multi-pod scaling)
- Separate namespaces: `/live-show` and `/playclips` — never share a namespace
- Players sharded to WebSocket pods by `user_id % num_pods` (P4-T06)

**Kafka topics:**
- `game.events`, `player.answers`, `show.lifecycle`, `analytics.events`
- 12 partitions on `player.answers` to support consumer throughput
- Analytics is write-only in P4; no in-app dashboards

**Coin ledger:**
- All coin mutations go through `CoinService.credit()` and `CoinService.debit()` — never direct SQL
- Balance cached in Redis with write-through

**Scoring:**
- Server is always authoritative; client timers are display-only
- Knife at Center: both client and server use identical deterministic oscillation formula seeded from `game:start` event

**Security:**
- Admin endpoints require `admin` JWT scope checked server-side
- Client is untrusted for all coordinates, answers, timestamps
- S3 private; all content via signed CDN URLs
- Secrets via AWS Secrets Manager only

**Database:**
- Read replicas for leaderboard, analytics, feed queries (P4-T09)
- Writes stay on primary
- Schema is append-only in P1; no destructive migrations without PM sign-off

**How to apply:** When designing any new task that touches these systems, verify it is consistent with these constraints before specifying implementation details.
