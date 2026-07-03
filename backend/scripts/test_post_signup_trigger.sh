#!/usr/bin/env bash
# Integration test: post_signup_trigger against real Supabase.
#
# Simulates a Cognito PostConfirmation_ConfirmSignUp event, calls the trigger
# handler, and verifies the user row was created in Supabase.
#
# Prerequisites:
#   - Supabase project is awake (first request may take 5-10s if idle)
#   - Tables created (run the API at least once or `uvicorn src.main:app` for 3s)
#   - .env has DATABASE_URL set

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Post-Signup Trigger Integration Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# ── Load env ──────────────────────────────────────────────
if [ -f "$BACKEND_DIR/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$BACKEND_DIR/.env"
  set +a
  echo "✅ Loaded $BACKEND_DIR/.env"
else
  echo "❌ .env not found at $BACKEND_DIR/.env"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL not set in .env"
  exit 1
fi
echo "   DATABASE_URL: ${DATABASE_URL:0:40}..."

# ── Sanity check: run a Python one-liner to test connectivity ──
echo
echo "━━━ DB Connectivity Check ━━━"
cd "$BACKEND_DIR"

VENV_PYTHON=".venv/bin/python"

# Create a one-shot test that calls the trigger handler directly
"$VENV_PYTHON" -c "
import os, sys, uuid, json
from datetime import datetime, timezone

# Simulate the sys.path setup (same as trigger_handler.py)
sys.path.insert(0, os.path.join('$BACKEND_DIR', 'src'))

os.environ['DATABASE_URL'] = '$DATABASE_URL'

from trigger.post_signup_trigger import handler

# Generate a unique test user so we can verify + clean up
test_email = f'integration-test-{uuid.uuid4().hex[:8]}@test.local'
test_sub = str(uuid.uuid4())

event = {
    'triggerSource': 'PostConfirmation_ConfirmSignUp',
    'request': {
        'userAttributes': {
            'sub': test_sub,
            'email': test_email,
            'name': 'Integration Test User',
            'custom:govId': 'TEST-001',
            'custom:role': 'customer',
        },
    },
}

print(f'Test user: {test_email} (sub={test_sub})')
print(f'Trigger source: {event[\"triggerSource\"]}')
print()

# ── Call the handler ─────────────────────────────────
print('Calling handler...')
try:
    result = handler(event, {})
    print(f'✅ Handler returned event (no exception)')
    print(f'   Returned triggerSource: {result.get(\"triggerSource\", \"N/A\")}')
except Exception as e:
    print(f'❌ Handler raised: {type(e).__name__}: {e}')
    sys.exit(1)

# ── Verify the user row was created ──────────────────
print()
print('Verifying user row in Supabase...')
import psycopg

db_url = os.environ['DATABASE_URL']
if '+' in db_url and '://' in db_url:
    scheme, rest = db_url.split('://', 1)
    if '+' in scheme:
        db_url = scheme.split('+')[0] + '://' + rest
# Enforce SSL for public-internet connections (parity with trigger handler)
if 'sslmode' not in db_url:
    sep = '&' if '?' in db_url else '?'
    db_url = f'{db_url}{sep}sslmode=require'

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute(
            'SELECT user_id, role, email, full_name, gov_id, is_active FROM users WHERE email = %s',
            (test_email,)
        )
        row = cur.fetchone()
        if row is None:
            print(f'❌ User NOT FOUND in database!')
            sys.exit(1)
        
        user_id, role, db_email, full_name, gov_id, is_active = row
        print(f'✅ User found in database:')
        print(f'   user_id:   {user_id}')
        print(f'   email:     {db_email}')
        print(f'   full_name: {full_name}')
        print(f'   role:      {role}')
        print(f'   gov_id:    {gov_id}')
        print(f'   is_active: {is_active}')
        
        # Validate fields
        errors = []
        if str(user_id) != test_sub:
            errors.append(f'user_id mismatch: expected {test_sub}, got {user_id}')
        if role != 'customer':
            errors.append(f'role mismatch: expected customer, got {role}')
        if db_email != test_email:
            errors.append(f'email mismatch: expected {test_email}, got {db_email}')
        if full_name != 'Integration Test User':
            errors.append(f'full_name mismatch')
        if gov_id != 'TEST-001':
            errors.append(f'gov_id mismatch')
        if not is_active:
            errors.append('is_active should be True')
        
        if errors:
            for err in errors:
                print(f'   ❌ {err}')
            sys.exit(1)
        else:
            print(f'   ✅ All fields validated')
        
        # ── Clean up test user ───────────────────────
        print()
        print('Cleaning up test user...')
        cur.execute('DELETE FROM users WHERE email = %s', (test_email,))
        conn.commit()
        print(f'✅ Test user deleted')

print()
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
print('✅ Post-signup trigger integration test PASSED')
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
"

EXIT_CODE=$?
echo
if [ $EXIT_CODE -eq 0 ]; then
  echo "🎉 Trigger works end-to-end: Cognito event → handler → Supabase row → verified"
else
  echo "❌ Integration test failed with exit code $EXIT_CODE"
fi
exit $EXIT_CODE
