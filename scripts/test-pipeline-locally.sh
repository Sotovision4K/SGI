#!/usr/bin/env bash
# Simulates the backend.yml pipeline steps locally.
# AWS steps are skipped unless AWS credentials are configured.
# Usage: ./scripts/test-pipeline-locally.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Step 1: Clean previous packaging ==="
rm -rf .packaged
mkdir -p .packaged/lambda

echo ""
echo "=== Step 2: Copy source files ==="
cp -r backend/src .packaged/lambda/
cp backend/handler.py .packaged/lambda/
cp backend/trigger_handler.py .packaged/lambda/
cp backend/alembic.ini .packaged/lambda/
cp -r backend/migrations .packaged/lambda/
echo "  src/, handler.py, trigger_handler.py, alembic.ini, and migrations/ copied"

echo ""
echo "=== Step 3: Install production dependencies ==="
cd backend && uv export --no-dev --no-emit-project -o requirements.txt && cd ..
uv pip install --target .packaged/lambda/ -r backend/requirements.txt
rm -f backend/requirements.txt
echo "  Production dependencies installed (no dev packages)"

echo ""
echo "=== Step 4: Clean build artifacts ==="
find .packaged/lambda -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find .packaged/lambda -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find .packaged/lambda -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
find .packaged/lambda -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
find .packaged/lambda -type f -name "*.pyc" -delete 2>/dev/null || true
find .packaged/lambda -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null || true
echo "  Cleaned"

echo ""
echo "=== Step 5: Create zip ==="
python3 -c "
import zipfile, os
with zipfile.ZipFile('.packaged/function.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.packaged/lambda'):
        for f in files:
            path = os.path.join(root, f)
            arcname = os.path.relpath(path, '.packaged/lambda')
            zf.write(path, arcname)
"
ZIP_SIZE=$(du -h .packaged/function.zip | cut -f1)
ZIP_SIZE_BYTES=$(stat -c%s .packaged/function.zip 2>/dev/null || stat -f%z .packaged/function.zip 2>/dev/null)
echo -e "${GREEN}  Created .packaged/function.zip (${ZIP_SIZE})${NC}"

if [ "$ZIP_SIZE_BYTES" -gt 52428800 ]; then
  echo -e "${YELLOW}  WARNING: Zip > 50MB (${ZIP_SIZE}). S3 upload is required.${NC}"
else
  echo -e "${GREEN}  Zip < 50MB. Direct Lambda upload is possible.${NC}"
fi

echo ""
echo "=== Step 6: Verify zip contents ==="
VERIFY=$(python3 -c "
import zipfile
with zipfile.ZipFile('.packaged/function.zip', 'r') as zf:
    names = zf.namelist()
    has_handler = any(n.endswith('handler.py') for n in names)
    has_trigger = any('trigger_handler.py' in n for n in names)
    has_fastapi = any('fastapi/__init__.py' in n for n in names)
    has_alembic_ini = any('alembic.ini' in n for n in names)
    has_migration = any('versions/' in n for n in names)
    print(f'{int(has_handler)} {int(has_trigger)} {int(has_fastapi)} {int(has_alembic_ini)} {int(has_migration)} {len(names)}')
")
HAS_HANDLER=$(echo "$VERIFY" | cut -d' ' -f1)
HAS_TRIGGER=$(echo "$VERIFY" | cut -d' ' -f2)
HAS_FASTAPI=$(echo "$VERIFY" | cut -d' ' -f3)
HAS_ALEMBIC_INI=$(echo "$VERIFY" | cut -d' ' -f4)
HAS_MIGRATION=$(echo "$VERIFY" | cut -d' ' -f5)
FILE_COUNT=$(echo "$VERIFY" | cut -d' ' -f6)

if [ "$HAS_HANDLER" = "1" ]; then
  echo -e "${GREEN}  handler.py found in zip${NC}"
else
  echo -e "${RED}  ERROR: handler.py missing from zip${NC}"
fi
if [ "$HAS_TRIGGER" = "1" ]; then
  echo -e "${GREEN}  trigger_handler.py found in zip${NC}"
else
  echo -e "${RED}  ERROR: trigger_handler.py missing from zip${NC}"
fi
if [ "$HAS_FASTAPI" = "1" ]; then
  echo -e "${GREEN}  fastapi found in zip (${FILE_COUNT} files total)${NC}"
else
  echo -e "${RED}  ERROR: fastapi missing from zip${NC}"
fi
if [ "$HAS_ALEMBIC_INI" = "1" ]; then
  echo -e "${GREEN}  alembic.ini found in zip${NC}"
else
  echo -e "${RED}  ERROR: alembic.ini missing from zip${NC}"
fi
if [ "$HAS_MIGRATION" = "1" ]; then
  echo -e "${GREEN}  migrations/versions/ found in zip${NC}"
else
  echo -e "${RED}  ERROR: migrations/versions/ missing from zip${NC}"
fi

echo ""
echo "=== Step 7: AWS upload + Lambda update (skip if no credentials) ==="
if aws sts get-caller-identity &>/dev/null; then
  echo "  AWS credentials detected. Running upload + update..."
  echo ""

  echo "  Uploading to S3..."
  aws s3 cp .packaged/function.zip s3://cert-app-dev-frontend/lambdas/function.zip

  echo "  Updating Lambda..."
  aws lambda update-function-code \
    --function-name cert-app-dev-api \
    --s3-bucket cert-app-dev-frontend \
    --s3-key lambdas/function.zip

  echo "  Waiting for code update to finish..."
  aws lambda wait function-updated --function-name cert-app-dev-api

  echo "  Updating Post-Signup Trigger Lambda..."
  aws lambda update-function-code \
    --function-name cert-app-dev-post-signup \
    --s3-bucket cert-app-dev-frontend \
    --s3-key lambdas/function.zip

  echo "  Waiting for trigger code update to finish..."
  aws lambda wait function-updated --function-name cert-app-dev-post-signup

  echo "  Updating ANTHROPIC_API_KEY env var..."
  ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
  if [ -z "$ANTHROPIC_KEY" ]; then
    echo "  ANTHROPIC_API_KEY not set, skipping env var update"
  else
    CURRENT_ENV=$(aws lambda get-function-configuration \
      --function-name cert-app-dev-api \
      --query 'Environment.Variables' \
      --output json 2>/dev/null || echo "{}")
    if [ "$CURRENT_ENV" = "null" ] || [ -z "$CURRENT_ENV" ]; then
      CURRENT_ENV="{}"
    fi
    UPDATED_ENV=$(echo "$CURRENT_ENV" | jq --arg key "$ANTHROPIC_KEY" '. + {ANTHROPIC_API_KEY: $key}')
    aws lambda update-function-configuration \
      --function-name cert-app-dev-api \
      --environment "$(echo "$UPDATED_ENV" | jq -c '{Variables: .}')"
    echo "  ANTHROPIC_API_KEY updated"
  fi

  echo ""
  echo "  Waiting 15s for Lambda update to propagate..."
  sleep 15

  echo "  Smoke testing /health..."
  API_ID=$(aws apigateway get-rest-apis \
    --query "items[?name=='cert-app-dev-api'].id" \
    --output text)
  if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
    echo -e "${RED}  ERROR: Could not find API Gateway ID for 'cert-app-dev-api'${NC}"
    exit 1
  fi
  API_URL="https://${API_ID}.execute-api.us-east-1.amazonaws.com/v1/health"
  echo "  Hitting: ${API_URL}"
  curl -f --retry 5 --retry-delay 5 --max-time 30 "${API_URL}" && echo ""
  echo -e "${GREEN}  /health returned 200!${NC}"
else
  echo -e "${YELLOW}  No AWS credentials found. Skipping S3 upload, Lambda update, and smoke test.${NC}"
  echo "  To run the full pipeline, configure AWS credentials and re-run this script."
fi

echo ""
echo -e "${GREEN}=== Local pipeline test complete ===${NC}"
