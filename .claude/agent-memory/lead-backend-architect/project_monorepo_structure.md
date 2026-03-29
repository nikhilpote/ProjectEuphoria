---
name: Euphoria Monorepo Structure
description: Directory layout and workspace conventions for the Euphoria monorepo
type: project
---

Monorepo is at `/home/nikhil/Projects/ProjectEuphoria`. npm workspaces + Turborepo (turbo.json at root).

**Workspace layout:**
```
apps/
  api/       — @euphoria/api — NestJS REST + WebSocket backend
  admin/     — @euphoria/admin — React + Vite + TailwindCSS admin dashboard
packages/
  types/     — @euphoria/types — Shared TypeScript-only type definitions
```

**Key paths in apps/api:**
- `src/main.ts` — NestJS bootstrap
- `src/app.module.ts` — root module, registers all feature modules
- `src/database/schema.ts` — Kysely DB type definitions (mirrors SQL schema)
- `src/database/database.module.ts` — Kysely<DB> provider (token: KYSELY_TOKEN)
- `src/database/redis.module.ts` — ioredis provider (token: REDIS_CLIENT)
- `src/database/migrations/` — SQL migration files (001_initial_schema.sql, ...)
- `src/database/migrate.ts` — migration runner (`npm run db:migrate`)
- `src/modules/{auth,user,show,economy,playclips,admin,feature-flags}/`
- `src/gateways/show/` — ShowGateway (Socket.IO /show namespace)
- `src/gateways/clips/` — ClipsGateway (Socket.IO /clips namespace)
- `src/common/filters/` — HttpExceptionFilter (wraps errors in ApiError shape)
- `src/common/interceptors/` — ResponseInterceptor (wraps success in ApiSuccess shape)
- `src/common/decorators/` — @Public(), @CurrentUser()
- `docker-compose.yml` — postgres:16 + redis:7 for local dev
- `.env.example` — all required env vars

**Why:** Turborepo provides task graph caching (build → dev → lint → test) and parallel execution. npm workspaces allow `@euphoria/types` to be resolved locally without publishing to npm.

**How to apply:** When adding new apps or packages, add them under `apps/` or `packages/` and they will be automatically picked up by the workspace. Register new Turbo tasks in `turbo.json`.
