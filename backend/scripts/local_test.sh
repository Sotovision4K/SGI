#!/usr/bin/env bash
# Local API test — create a company and a process.
# Requires: backend running on http://localhost:8000
#           LOCAL_DEV=true (in .env — any Bearer token works)

set -euo pipefail

API="http://localhost:8000/api/v1"
TOKEN="local-dev-bypass-token"

echo "━━━ Health Check ━━━"
curl -sf "${API}/health" | python3 -m json.tool || {
  echo "❌ Backend not running. Start with: docker compose up"
  exit 1
}
echo

echo "━━━ Create Company ━━━"
COMPANY=$(curl -sf -X POST "${API}/companies" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Company S.A.", "business_type": "manufacturing"}')
echo "$COMPANY" | python3 -m json.tool

COMPANY_ID=$(echo "$COMPANY" | python3 -c "import sys,json; print(json.load(sys.stdin)['company_id'])")
echo "✅ Company ID: $COMPANY_ID"
echo

echo "━━━ Create Process ━━━"
PROCESS=$(curl -sf -X POST "${API}/processes" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"company_id\": \"${COMPANY_ID}\", \"iso_standard\": \"iso9001\"}")
echo "$PROCESS" | python3 -m json.tool

PROCESS_ID=$(echo "$PROCESS" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "✅ Process ID: $PROCESS_ID"
echo

echo "━━━ List Processes ━━━"
curl -sf "${API}/processes" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool

echo
echo "━━━ List Companies ━━━"
curl -sf "${API}/companies" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All tests passed!"
echo "   Company: ${COMPANY_ID}"
echo "   Process: ${PROCESS_ID}"
echo
echo "To test with real Cognito, set LOCAL_DEV=false in .env"
echo "and get a JWT from:"
echo "  POST https://cognito-idp.us-east-1.amazonaws.com/"
echo ""
echo "Test with curl using real Cognito:"
echo "  curl -H 'Authorization: Bearer \$TOKEN' ${API}/companies"
