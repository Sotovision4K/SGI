# SGI Pro

SGI Pro is an automation certification tool for ISO management systems (ISO 9001, 14001, 45001).

## Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind + Radix UI (`frontend/`)
- **Backend**: FastAPI + SQLModel + PostgreSQL (`backend/`)
- **Auth**: AWS Cognito via `react-oidc-context`
- **Package managers**: `pnpm` (frontend), `uv` (backend)

## First-time setup

```bash
# Frontend
cd frontend
pnpm install

# Backend
cd ../backend
uv sync

# Install git pre-commit hook (runs lint/build on staged files)
cd ..
make install-hooks
# or: pnpm --dir frontend install-hooks
```

## Common commands

```bash
make help            # List all available targets

make lint            # Run all linters (frontend eslint + backend ruff)
make test            # Run all tests (frontend build + backend pytest)
make build           # Production frontend build
make install-hooks   # Install the pre-commit hook
make uninstall-hooks # Remove the pre-commit hook
make clean           # Remove build artifacts
```

### Frontend (per-project)
```bash
cd frontend
pnpm dev          # Dev server (http://localhost:5173)
pnpm build        # tsc + vite build
pnpm lint         # eslint
pnpm preview      # Preview production build
```

### Backend (per-project)
```bash
cd backend
uv run uvicorn src.main:app --reload   # Dev server (http://localhost:8000)
uv run pytest                          # Run tests
uv run ruff check .                    # Lint
```

## Pre-commit hook

A pre-commit hook is installed via `make install-hooks` (or `pnpm --dir frontend install-hooks`).

On every commit, it runs the relevant linters and typecheckers on staged files:

- `pnpm lint` and `pnpm build` when **frontend/** files are staged
- `uv run ruff check .` and `uv run pytest` when **backend/** files are staged
- Skips silently if the relevant tool (`pnpm` / `uv`) is not on `PATH`

Bypass with `git commit --no-verify` when needed.

The hook lives at `scripts/pre-commit.sh` (tracked in git) and is symlinked into `.git/hooks/pre-commit`.

## Project structure

```
cert_app/
├── frontend/                 # React + Vite + TypeScript
├── backend/                  # FastAPI + SQLModel
├── infra/                    # Terraform (network, cognito, frontend, backend, iam)
├── .github/workflows/        # CI/CD pipelines
├── scripts/                  # Pre-commit hook + installer
├── Makefile
├── AGENTS.md                 # OpenCode agent guidance
└── README.md
```
