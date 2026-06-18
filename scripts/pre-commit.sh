#!/usr/bin/env bash
# Pre-commit hook for cert_app
# Runs the project's linters/typecheckers on staged files.
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

# --- Gather staged files -----------------------------------------------------

STAGED_FRONTEND=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^frontend/' || true)
STAGED_BACKEND=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^backend/' || true)

if [ -z "$STAGED_FRONTEND$STAGED_BACKEND" ]; then
  ok "No frontend or backend files staged — skipping pre-commit checks."
  exit 0
fi

FAILED=0

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
    if (cd backend && uv run ruff check .); then
      ok "Backend ruff passed."
    else
      fail "Backend ruff failed."
      FAILED=1
    fi

    step "Backend: uv run pytest"
    if (cd backend && uv run pytest); then
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
