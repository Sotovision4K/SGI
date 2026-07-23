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
echo "  src/ and handler.py copied"

echo ""
echo "=== Step 3: Copy site-packages ==="
SITE_PKGS=$(find backend/.venv -type d -name "site-packages" 2>/dev/null | head -1)
# Preserve relative path structure so Lambda can find packages
VENV_REL=$(echo "$SITE_PKGS" | sed 's|^backend/||')
VENV_DEST=".packaged/lambda/${VENV_REL}"
if [ ! -d "$SITE_PKGS" ]; then
  echo -e "${RED}ERROR: $SITE_PKGS not found. Run 'uv sync' in backend/ first.${NC}"
  exit 1
fi
mkdir -p "$VENV_DEST"
cp -r "$SITE_PKGS" "$VENV_DEST/"
PACKAGE_COUNT=$(ls "$VENV_DEST/site-packages" 2>/dev/null | wc -l)
echo "  Copied ~$PACKAGE_COUNT packages"

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
    has_handler = any('handler.py' in n for n in names)
    has_fastapi = any('fastapi/__init__.py' in n for n in names)
    print(f'{int(has_handler)} {int(has_fastapi)} {len(names)}')
")
HAS_HANDLER=$(echo "$VERIFY" | cut -d' ' -f1)
HAS_FASTAPI=$(echo "$VERIFY" | cut -d' ' -f2)
FILE_COUNT=$(echo "$VERIFY" | cut -d' ' -f3)

if [ "$HAS_HANDLER" = "1" ]; then
  echo -e "${GREEN}  handler.py found in zip${NC}"
else
  echo -e "${RED}  ERROR: handler.py missing from zip${NC}"
fi
if [ "$HAS_FASTAPI" = "1" ]; then
  echo -e "${GREEN}  fastapi found in zip (${FILE_COUNT} files total)${NC}"
else
  echo -e "${RED}  ERROR: fastapi missing from zip${NC}"
fi

echo ""
echo "=== Step 7: AWS upload + Lambda update (skip if no credentials) ==="
if aws sts get-caller-identity &>/dev/null; then
  echo "  AWS credentials detected. Running upload + update..."
  echo ""

  echo "  Deploying to Lambda..."
  aws lambda update-function-code \
    --function-name cert-app-dev-api \
    --zip-file fileb://.packaged/function.zip

  echo "  Waiting for code update to finish..."
  aws lambda wait function-updated --function-name cert-app-dev-api

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
