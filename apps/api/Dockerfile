# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy ALL workspace package.jsons — npm needs the full graph even for filtered install
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/

# Install only the workspaces we need (types + api)
RUN npm ci -w packages/types -w apps/api --include-workspace-root

# Copy source code
COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

# Build shared types first, then API
RUN npm run build -w packages/types && npm run build -w apps/api

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache ffmpeg wget

WORKDIR /app

# Copy node_modules from root (npm workspaces hoists everything here)
COPY --from=builder /app/node_modules ./node_modules

# Copy built packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/package.json ./package.json

# Copy migration SQL files to where the compiled migrate.js expects them
# migrate.ts uses path.join(__dirname, 'migrations') → dist/database/migrations/
COPY --from=builder /app/apps/api/src/database/migrations ./apps/api/dist/database/migrations

# Copy seed SQL files (idempotent — every seed uses ON CONFLICT)
# migrate.ts also runs seeds from path.join(__dirname, 'seeds')
COPY --from=builder /app/apps/api/src/database/seeds ./apps/api/dist/database/seeds

# Copy entrypoint
COPY deploy/staging/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app/apps/api
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
