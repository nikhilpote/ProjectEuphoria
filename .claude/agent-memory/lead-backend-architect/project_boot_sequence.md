---
name: Euphoria Boot Sequence & Infrastructure
description: Verified boot order, service ports, Docker container names, and known startup gotchas after boot audit 2026-03-27
type: project
---

Boot sequence verified 2026-03-27. BOOT_CHECKLIST.md at repo root has full first-boot guide.

**Boot order:** `npm install` → copy `.env.example` to `apps/api/.env` → `docker compose up -d` → `npm run db:migrate` → `npm run dev`

**Service ports:**
- API (NestJS): `http://localhost:3000`
- Health check: `GET /health` (bypasses `api/v1` prefix — registered on raw Express adapter)
- All API routes: `http://localhost:3000/api/v1/...`
- Swagger: `http://localhost:3000/docs` (dev only)
- Admin (Vite): `http://localhost:5173`
- Postgres: `localhost:5432`, DB `euphoria_dev`, user/pass `euphoria`
- Redis: `localhost:6379`

**Docker container names:** `euphoria-postgres`, `euphoria-redis`, `euphoria-redis-ui` (debug profile only)

**Migration runner:** `apps/api/src/database/migrate.ts` — reads `src/database/migrations/*.sql` sorted alphabetically, tracks applied in `schema_migrations` table. Idempotent. Run via `npm run db:migrate`. Uses `tsx` + `__dirname` so must be run with cwd = `apps/api/` (Turbo handles this via `--filter=@euphoria/api`).

**Migration files:** 001_initial_schema.sql, 002_social_auth.sql, 003_feature_flags_seed.sql, 004_trivia_questions.sql

**Why:** Boot audit to make `npm run dev` work end-to-end. Found and fixed 3 bugs: wrong Docker container name format (underscores vs hyphens), wrong npm workspace flag in `dev:mobile` script, missing `/health` endpoint and startup env-var warnings in `main.ts`.

**How to apply:** When adding new migrations, name them `NNN_description.sql` so alphabetical sort gives correct order. When adding new API modules, wire them into `app.module.ts` imports array. The `/health` route is registered before `setGlobalPrefix` on the raw HTTP adapter — don't move it after.
