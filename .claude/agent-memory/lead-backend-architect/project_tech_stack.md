---
name: Euphoria Backend Tech Stack
description: Canonical technology choices for the Euphoria backend — language, frameworks, databases, infra
type: project
---

Euphoria backend is TypeScript/Node.js with NestJS, PostgreSQL, Redis Cluster (including Redis Streams for the answer pipeline). Kafka was explicitly rejected for MVP in favor of Redis Streams.

**Why:** TypeScript shared with React Native frontend allows a shared `@euphoria/types` package for socket event interfaces and API contracts — compile-time safety across the client/server boundary. Redis Streams chosen over Kafka for MVP because Redis is already in the stack, handles ~100K concurrent players per show, and costs $0 additional vs. ~$300/month for MSK.

**Full stack:**
- REST API + WebSocket Gateways: NestJS (TypeScript)
- Primary DB: PostgreSQL 16 (ACID for wallet, JSONB for game payloads)
- Cache / pub-sub / leaderboard: Redis 7 Cluster
- Answer pipeline / event bus: Redis Streams (XADD/XREADGROUP/XACK, consumer groups per show)
- Analytics: ClickHouse (never queried at runtime — analytics only)
- Object storage + CDN: S3 + CloudFront
- Anomaly / log search: OpenSearch
- Infra: AWS EKS (Kubernetes)
- Query builder: Kysely (no ORM — raw SQL on hot paths). Prisma was proposed but rejected in favor of Kysely.
- DB migrations: Hand-written SQL files in `apps/api/src/database/migrations/`, applied by `src/database/migrate.ts` (custom runner). No ORM codegen.
- Monorepo: npm workspaces + Turborepo. Root `package.json` defines workspaces: `apps/*`, `packages/*`.
- Admin dashboard: `apps/admin` — React + Vite + TailwindCSS (responsive web).
- Shared types: `packages/types` (@euphoria/types) — pure TypeScript, no runtime code, safe to import on server and client.

**Migration path:** Kafka becomes relevant if concurrent players per show consistently exceeds ~500K (Year 2+). The stream key naming maps directly to Kafka topic naming to keep the migration low-friction.

**How to apply:** Any new service must align with this stack. Do not introduce Kafka, Prisma, or any ORM — use Kysely + raw SQL migrations. Introducing a new database or queue requires explicit architectural justification.
