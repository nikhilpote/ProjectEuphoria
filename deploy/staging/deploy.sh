#!/bin/bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
EC2_HOST="${EUPHORIA_EC2_HOST:-ubuntu@YOUR_EC2_IP}"
EC2_KEY="${EUPHORIA_EC2_KEY:-~/.ssh/euphoria-staging.pem}"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_DIR="/opt/euphoria"

cd "$PROJECT_ROOT"

echo "=== Building admin SPA ==="
# Empty VITE_API_URL → admin uses same-origin (nginx serves both)
VITE_API_URL="" npm run build -w apps/admin

echo "=== Syncing project to EC2 ==="
rsync -avz --delete \
  -e "ssh -i $EC2_KEY" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='.expo' \
  --exclude='*.mp4' \
  --exclude='*.mov' \
  --exclude='FridayNightShow*' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='!.env.staging.template' \
  . "$EC2_HOST:$REMOTE_DIR/src/"

echo "=== Syncing admin build ==="
rsync -avz -e "ssh -i $EC2_KEY" \
  apps/admin/dist/ \
  "$EC2_HOST:$REMOTE_DIR/admin-dist/"

echo "=== Deploying on EC2 ==="
ssh -i "$EC2_KEY" "$EC2_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/euphoria

# Copy staging configs into place
cp -f src/deploy/staging/docker-compose.staging.yml docker-compose.yml
cp -f src/deploy/staging/nginx.conf nginx.conf

# Build API image
docker compose build api

# Start/restart everything
docker compose up -d --remove-orphans

echo ""
echo "=== Service Status ==="
docker compose ps
REMOTE

echo ""
echo "=== Deploy complete ==="
