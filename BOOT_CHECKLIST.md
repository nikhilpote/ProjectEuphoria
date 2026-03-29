# Euphoria — First Boot Checklist

## Prerequisites

- Node.js >= 20, npm >= 10
- Docker Desktop (or Docker Engine + Compose v2)

---

## First Boot: Step-by-Step

### 1. Install all dependencies

```bash
npm install
```

Run from the repo root. npm workspaces installs deps for all packages
(`apps/api`, `apps/admin`, `apps/mobile`, `packages/*`) in a single pass.

---

### 2. Copy and fill environment variables

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set at minimum:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Defaults to `postgresql://euphoria:euphoria@localhost:5432/euphoria_dev` — matches docker-compose |
| `REDIS_URL` | Yes | Defaults to `redis://localhost:6379` — matches docker-compose |
| `JWT_SECRET` | Yes | Any 64+ char random string for development |
| `JWT_REFRESH_SECRET` | Yes | Different 64+ char random string |
| `ANSWER_ENCRYPTION_KEY` | Yes | 64 hex chars (32 bytes). Use `openssl rand -hex 32` |

Apple/Google OAuth and IAP keys are optional for local dev — those endpoints will return 500 if unconfigured but the rest of the API works.

---

### 3. Start infrastructure (Postgres + Redis)

```bash
docker compose -f apps/api/docker-compose.yml up -d
```

Wait for containers to be healthy:

```bash
docker compose -f apps/api/docker-compose.yml ps
```

Both `euphoria-postgres` and `euphoria-redis` should show `healthy`.

---

### 4. Run database migrations

```bash
npm run db:migrate
```

This runs `apps/api/src/database/migrate.ts` via `tsx`, which applies all
`.sql` files in `apps/api/src/database/migrations/` in order:

1. `001_initial_schema.sql`
2. `002_social_auth.sql`
3. `003_feature_flags_seed.sql`
4. `004_trivia_questions.sql`

The runner is idempotent — safe to re-run. Applied migrations are tracked in
the `schema_migrations` table.

---

### 5. Start API + Admin dashboard

```bash
npm run dev
```

Turbo starts both workspaces. Mobile is excluded from this pipeline.

---

### 6. (Optional) Start mobile dev server

In a separate terminal:

```bash
npm run dev:mobile
```

This starts Expo with `--tunnel` mode. Requires the Expo Go app on your phone
or a simulator.

---

## What Runs Where

| Service | URL | Notes |
|---|---|---|
| API (NestJS) | `http://localhost:3000` | REST + WebSocket |
| API health check | `http://localhost:3000/health` | Returns `{ status: 'ok', timestamp }` — bypasses global prefix |
| API routes | `http://localhost:3000/api/v1/...` | All domain routes live under this prefix |
| Swagger UI | `http://localhost:3000/docs` | Dev/staging only |
| Admin (Vite) | `http://localhost:5173` | React dashboard |
| Postgres | `localhost:5432` | DB: `euphoria_dev`, user/pass: `euphoria` |
| Redis | `localhost:6379` | No auth in dev |
| Redis Commander UI | `http://localhost:8081` | Only when started with `--profile debug` |

To enable Redis Commander:
```bash
docker compose -f apps/api/docker-compose.yml --profile debug up -d
```

---

## Common Issues and Fixes

### `DATABASE_URL environment variable is required` during migration

You ran `npm run db:migrate` without `apps/api/.env` being present or without
sourcing it. Fix:

```bash
# Option A — ensure .env exists in apps/api/
cp apps/api/.env.example apps/api/.env
# then edit it

# Option B — pass inline
DATABASE_URL=postgresql://euphoria:euphoria@localhost:5432/euphoria_dev npm run db:migrate
```

---

### API crashes on boot with `Nest can't resolve dependencies`

A NestJS module import is missing or circular. Check `app.module.ts`. All
domain modules must be listed in the `imports` array. The boot log will name
the exact token that couldn't be resolved.

---

### `[Bootstrap] WARNING: environment variable "JWT_SECRET" is not set`

The API will log this and continue, but auth endpoints will fail. Set
`JWT_SECRET` in `apps/api/.env`.

---

### Migrations fail with `relation already exists`

The migration runner uses `schema_migrations` to track applied files. If a
migration was partially applied (e.g., Postgres was killed mid-transaction),
manually inspect `schema_migrations` and remove the failed row if needed,
then fix the SQL and re-run.

---

### Port 5432 already in use

Another Postgres instance is running locally. Either stop it or change the
host port mapping in `apps/api/docker-compose.yml`:

```yaml
ports:
  - '5433:5432'   # expose on 5433 instead
```

Then update `DATABASE_URL` in `.env` to use port `5433`.

---

### `expo: command not found` when running `npm run dev:mobile`

```bash
npm install -g expo-cli
# or use npx directly:
npx expo start --tunnel
```

---

### Admin build fails with TypeScript errors

```bash
npm run lint --workspace=apps/admin
```

The admin app uses `tsc --noEmit` for type-checking. Fix type errors before
running `build`.

---

## Tear Down

```bash
# Stop Docker services (keep volumes/data)
docker compose -f apps/api/docker-compose.yml down

# Stop and wipe all data
docker compose -f apps/api/docker-compose.yml down -v

# Clean all build artifacts and node_modules
npm run clean
```
