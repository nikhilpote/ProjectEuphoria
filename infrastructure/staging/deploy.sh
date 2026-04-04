#!/bin/bash
set -euo pipefail
export PATH="$HOME/bin:$PATH"

REGION="ap-south-1"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HASH_FILE="$PROJECT_ROOT/infrastructure/staging/.deploy-hashes"

cd "$PROJECT_ROOT"

# Get values from Terraform
cd infrastructure/staging
ECR_URL=$(terraform output -raw ecr_repository_url)
CLUSTER="euphoria-staging"
SERVICE="euphoria-staging-api"
ADMIN_BUCKET=$(terraform output -raw admin_bucket)
ALB_DNS=$(terraform output -raw alb_dns)
cd "$PROJECT_ROOT"

# ── Change detection ───────────────────────────────────────────
touch "$HASH_FILE"
prev_api_hash=$(grep '^api=' "$HASH_FILE" 2>/dev/null | cut -d= -f2 || echo "")
prev_admin_hash=$(grep '^admin=' "$HASH_FILE" 2>/dev/null | cut -d= -f2 || echo "")

# Hash relevant source files
api_hash=$(find apps/api/src packages/types/src apps/api/Dockerfile -type f 2>/dev/null | sort | xargs md5sum | md5sum | cut -d' ' -f1)
admin_hash=$(find apps/admin/src apps/admin/index.html apps/admin/vite.config.ts -type f 2>/dev/null | sort | xargs md5sum | md5sum | cut -d' ' -f1)

API_CHANGED=false
ADMIN_CHANGED=false

if [ "$api_hash" != "$prev_api_hash" ]; then
  API_CHANGED=true
fi
if [ "$admin_hash" != "$prev_admin_hash" ]; then
  ADMIN_CHANGED=true
fi

# Allow forcing full deploy
if [ "${1:-}" = "--force" ]; then
  API_CHANGED=true
  ADMIN_CHANGED=true
fi

if [ "$API_CHANGED" = false ] && [ "$ADMIN_CHANGED" = false ]; then
  echo "=== No changes detected. Use --force to redeploy anyway ==="
  exit 0
fi

echo "=== Changes detected ==="
[ "$API_CHANGED" = true ] && echo "  API: changed"
[ "$ADMIN_CHANGED" = true ] && echo "  Admin: changed"
echo ""

# ── Deploy API ─────────────────────────────────────────────────
if [ "$API_CHANGED" = true ]; then
  echo "=== Logging into ECR ==="
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_URL"

  echo "=== Building API image (ARM64 for Graviton) ==="
  docker buildx build \
    --platform linux/arm64 \
    -f apps/api/Dockerfile \
    -t "$ECR_URL:latest" \
    --push .

  echo "=== Deploying new ECS task ==="
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --force-new-deployment \
    --region "$REGION"

  echo "=== Waiting for service stability ==="
  aws ecs wait services-stable \
    --cluster "$CLUSTER" \
    --services "$SERVICE" \
    --region "$REGION"
else
  echo "=== API unchanged, skipping ==="
fi

# ── Deploy Admin ───────────────────────────────────────────────
if [ "$ADMIN_CHANGED" = true ]; then
  echo "=== Building admin SPA ==="
  VITE_API_URL="http://$ALB_DNS" npm run build -w apps/admin

  echo "=== Uploading admin to S3 ==="
  aws s3 sync apps/admin/dist/ "s3://$ADMIN_BUCKET/" --delete --region "$REGION"
else
  echo "=== Admin unchanged, skipping ==="
fi

# ── Save hashes ────────────────────────────────────────────────
echo "api=$api_hash" > "$HASH_FILE"
echo "admin=$admin_hash" >> "$HASH_FILE"

echo ""
echo "=== Deploy complete ==="
echo "API:   http://$ALB_DNS/health"
echo "Admin: http://$ADMIN_BUCKET.s3-website.$REGION.amazonaws.com"
