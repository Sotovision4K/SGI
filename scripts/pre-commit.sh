#!/usr/bin/env bash
# Pre-commit hook for cert_app
# Runs secret scanning + the project's linters/typecheckers on staged files.
# Skips a check gracefully (with a notice) if the required toolchain is missing.
#
# Install:    make install-hooks
# Bypass:     git commit --no-verify

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { printf "\n${BLUE}==>${NC} %s\n" "$1"; }
ok()   { printf "${GREEN}✓${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }
fail() { printf "${RED}✗${NC} %s\n" "$1"; }

FAILED=0

# --- Secret scanning ----------------------------------------------------------
# Blocks commits that contain common secret patterns.
# This is a first-line defense — GitHub's push protection is the second.

step "Secret scanning"

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)

# Patterns that indicate hardcoded secrets
SECRET_PATTERNS=(
    'sk-ant-api03-[A-Za-z0-9_-]\{20,\}'   # Anthropic API key
    'AKIA[0-9A-Z]\{16\}'                   # AWS Access Key ID
    'aws_secret_access_key\s*=\s*["\047][A-Za-z0-9/+=]\{40\}["\047]'  # AWS Secret Key
    'ghp_[A-Za-z0-9]\{36\}'               # GitHub PAT
    'gho_[A-Za-z0-9]\{36\}'               # GitHub OAuth token
    'sk-[A-Za-z0-9]\{20,\}'               # OpenAI / generic API key (sk-...)
    'xox[baprs]-[A-Za-z0-9-]\{10,\}'      # Slack token
    'AIza[0-9A-Za-z_-]\{35\}'             # Google API key
    '-----BEGIN [A-Z ]*PRIVATE KEY-----'  # Private key block
)

SECRETS_FOUND=0
for file in $STAGED_FILES; do
    if [ ! -f "$file" ]; then
        continue
    fi
    for pattern in "${SECRET_PATTERNS[@]}"; do
        MATCH=$(git show ":$file" | grep -nE "$pattern" 2>/dev/null || true)
        if [ -n "$MATCH" ]; then
            fail "Potential secret found in $file:"
            echo "  $MATCH"
            SECRETS_FOUND=1
        fi
    done
done

if [ "$SECRETS_FOUND" -ne 0 ]; then
    fail "Secrets detected. Remove them before committing."
    fail "If this is a false positive, bypass with: git commit --no-verify"
    exit 1
fi
ok "No secrets detected in staged files."

# --- Gather staged files -----------------------------------------------------

STAGED_FRONTEND=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^frontend/' || true)
STAGED_BACKEND=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^backend/' || true)

if [ -z "$STAGED_FRONTEND$STAGED_BACKEND" ]; then
    ok "No frontend or backend files staged — skipping lint checks."
    exit 0
fi

# --- Frontend: lint + typecheck ---------------------------------------------

if [ -n "$STAGED_FRONTEND" ]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    warn "pnpm not found on PATH — skipping frontend lint/build."
  else
    step "Frontend: pnpm lint"
    if (cd frontend && pnpm lint); then
      ok "Frontend lint passed."
    else
      fail "Frontend lint failed."
      FAILED=1
    fi

    step "Frontend: pnpm build (tsc + vite)"
    if (cd frontend && pnpm build); then
      ok "Frontend build passed."
    else
      fail "Frontend build failed."
      FAILED=1
    fi
  fi
fi

# --- Backend: ruff + pytest -------------------------------------------------

if [ -n "$STAGED_BACKEND" ]; then
  if ! command -v uv >/dev/null 2>&1; then
    warn "uv not found on PATH — skipping backend ruff/pytest."
    warn "Run tests via 'cd backend && docker compose run --rm api uv run pytest' or install uv: https://docs.astral.sh/uv/"
  else
    step "Backend: uv run ruff check ."
    if (cd backend && uv run --no-sync ruff check .); then
      ok "Backend ruff passed."
    else
      fail "Backend ruff failed."
      FAILED=1
    fi

    step "Backend: uv run pytest"
    if (cd backend && uv run --no-sync pytest); then
      ok "Backend tests passed."
    else
      fail "Backend tests failed."
      FAILED=1
    fi
  fi
fi

# --- Result -----------------------------------------------------------------

echo
if [ "$FAILED" -ne 0 ]; then
  fail "Pre-commit checks failed. Commit aborted."
  exit 1
fi

ok "All pre-commit checks passed."
exit 0
