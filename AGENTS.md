# AGENTS.md

## Project Overview

SGI Pro is an automation certification tool for ISO management systems (ISO 9001, 14001, 45001). The repo has a frontend (React) and a backend (FastAPI).

## Frontend Commands

```bash
cd frontend
pnpm dev          # Start dev server
pnpm build        # TypeScript check + Vite build (run lint first)
pnpm lint         # ESLint check
pnpm preview      # Preview production build
pnpm install-hooks  # Install the git pre-commit hook
```

## Make Targets (repo root)

```bash
make help            # List all available targets
make install-hooks   # Install the git pre-commit hook
make uninstall-hooks # Remove the git pre-commit hook
make lint            # Run all linters (frontend eslint + backend ruff)
make test            # Run all tests (frontend build + backend pytest)
make build           # Production frontend build
make clean           # Remove build artifacts
```

## Pre-commit Hook

A pre-commit hook runs lint and typecheck on staged frontend/backend files. Install with `make install-hooks` (or `pnpm --dir frontend install-hooks`). The hook source is `scripts/pre-commit.sh` and is symlinked into `.git/hooks/pre-commit`. Bypass with `git commit --no-verify` when needed.

## Key Stack Details

- **Package manager**: pnpm (NOT npm/yarn). Required due to `.npmrc` with `shamefully-hoist=true` and `public-hoist-pattern` for react/radix
- **React Compiler**: Enabled via `babel-plugin-react-compiler` - impacts build performance
- **Zod v4**: Used for validation (not v3)
- **Auth**: AWS Cognito via `react-oidc-context` - config in `.env` with `VITE_*` prefix
- **Backend Python version**: pinned to **3.12**. Must match the Lambda runtime (`python3.12`), `setup-python` in `.github/workflows/backend.yml`, and `backend/.python-version`. Do NOT bump `backend/.python-version` without also updating the Lambda runtime — a mismatch makes the deployed zip contain the wrong `cpython-3XX` `.so` files and breaks every cold start with `Runtime.ImportModuleError`.

## Design System

### Landing page tokens (`tailwind.config.js` — current)

- Primary: `#0A2540` (dark navy)
- Accent: `#0066CC` (blue)
- Accent-light: `#E8F1FB`
- Text-main: `#1A1F36`
- Text-muted: `#5A6478`
- Bg-soft: `#F7F9FC`
- Success: `#00875A`

### App page tokens (`app.*` — authenticated pages, added 2026-07)

- `app-primary`: `#0B2A4A` (dark navy — sidebar, buttons, headings)
- `app-accent`: `#4FC3F7` (sky blue — icons, accents, progress)
- `app-bg`: `#F4F7FA` (page background)
- `app-text`: `#1E2A3A` (primary text)
- `app-muted`: `#7A8A9A` (secondary text/labels)
- `app-sidebar-link`: `#B0C4DE` (sidebar inactive links)
- `app-border`: `#E8EDF4` (borders/dividers)
- Status: `status-{in-progress,completed,pending,review}-bg` / `*-text`
- Layout: `components/layout/AppLayout.tsx` + `Sidebar.tsx` (nav sidebar)

## Architecture Notes

- Frontend entrypoint: `frontend/src/main.tsx` → `App.tsx`
- Routes use React Router v7
- Pages in `frontend/src/pages/`, components in `frontend/src/components/`
- Auth config at `frontend/src/lib/auth-config.tsx`

## Backend (Planned)

Backend uses FastAPI with the skill loaded from `agents/skills/fastapi/`. See `.opencode/docs/authentication.cognito.md` for the planned architecture and user table schema.

## OpenCode Config

Agent-specific instructions are in `.opencode/agents/` (frontend rules, mockup, styles). The `.opencode/agents/` directory also exists with additional frontend guidance.

## Existing Instruction Files

- `.opencode/docs/authentication.cognito.md` - Backend auth spec and user table schema
- `.opencode/agents/frontend/spec.md` - Frontend auth and registration requirements
- `.opencode/agents/frontend/rules/ayns-suspense-boundaries.md` - Strategic Suspense Boundaries pattern

## Ask

- see `.opencode/agents/clarify.md` if a question is ask

## Active Deployment Plan

**Before suggesting infrastructure changes**, read [`DEPLOY_PLAN.md`](./DEPLOY_PLAN.md). The app is **deployed and reachable** on AWS (FastAPI on Lambda + React on CloudFront + Supabase Postgres, VPC-less).

Quick context:
- Stack: AWS us-east-1, single `dev` environment, CloudFront default domain
- Backend: Lambda (via Mangum) + API Gateway (`authorization = "NONE"` today; in-code JWT validation in `get_current_user`)
- Database: **Supabase Postgres (Free tier)** — replaced the original RDS/VPC plan; no VPC, no NAT, no private subnets
- Schema: `SQLModel.metadata.create_all` in `lifespan` (migrate to Alembic before production; new columns need raw `ALTER TABLE` meanwhile)
- Secrets: GitHub Actions secrets → Lambda env vars on deploy (`DATABASE_URL`, `ANTHROPIC_API_KEY`, Cognito settings)
- Terraform state: **local** (`infra/environments/dev/terraform.tfstate`) — S3 + DynamoDB backend still pending

Current state: **deployment complete**. Pending hardening only: S3/DynamoDB state backend, Cognito Authorizer on API Gateway, OIDC in workflows (long-lived keys in use), action SHA pinning, `infra.yml`. See `DEPLOY_PLAN.md` for details.

Key files to know about:
- `backend/src/main.py` — FastAPI app, lifespan (`create_all`), configurable CORS (`CORS_ALLOW_ORIGINS`)
- `backend/handler.py` — Mangum wrapper for Lambda
- `backend/trigger_handler.py` — Cognito Post-Confirmation trigger entrypoint
- `backend/src/config/settings.py` — Pydantic settings, reads from env
- `infra/modules/` — Terraform modules: `backend`, `cognito`, `frontend`, `iam`, `trigger` (`network` and `rds` were removed in the VPC-less migration)
- `.github/workflows/backend.yml` — package → `lambda update-function-code --zip-file` → `/health` smoke test

When working on infrastructure, use the [`fastapi`](../.opencode/skills/fastapi/SKILL.md) skill for FastAPI best practices.
