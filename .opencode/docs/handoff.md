# Handoff — 2026-07-17

## Decision (Locked In)

**Scope: questionnaire-only.** We are building ONE product: an automation
certification tool for ISO management systems using a guided questionnaire
flow (formerly "Approach A"). The AI-agent / conversational variant
("Approach B") and the monorepo scaffolding built on branch
`approach/a-questionnaire` have been **discarded**.

- Branch `approach/a-questionnaire` has been **deleted**.
- We are back on `main` (fast-forwarded to `c7f887a`, latest).
- Working tree is clean except for two opencode-internal untracked files
  (`.opencode/commands/payload.md`, `.opencode/tools/payload.ts`) — leave
  them, they are tooling, not product code.

## What Was Discarded (Do Not Recreate)

- `pnpm-workspace.yaml`, root `package.json`, `pnpm-lock.yaml`
- `packages/app-a/frontend/`, `packages/app-b/frontend/`, `packages/shared/`
- Monorepo `Makefile` targets (`dev:a`, `dev:b`, dual build)
- Pre-diagnosis backend + frontend + 23 tests
  - `backend/src/domain/entities/process.py` +3 fields
  - `backend/src/adapters/db/process_repository.py` +3 columns, `update_process()`
  - `backend/src/routes/processes/routes.py` `PUT /{id}/pre-diagnosis`
  - `backend/tests/unit/test_pre_diagnosis.py`
  - `frontend/src/api/process.ts` `savePreDiagnosis()`
  - `frontend/src/pages/process/StartProcessModal.tsx` pre-diagnosis phase

If any of these features are wanted again, they must be **re-implemented on
`main` from scratch** (single `frontend/` folder, no workspaces).

## Current State of `main`

- Frontend: single React app at `frontend/` (Vite + React Router v7 + Cognito
  via `react-oidc-context`)
- Backend: FastAPI at `backend/`, Mangum wrapper at `backend/handler.py`,
  flat Lambda packaging (`uv pip install --target`)
- Tests: run with `make test` / `ruff check` + `pytest` (backend), `pnpm --dir frontend lint` + `tsc` (frontend)
- AWS account `774305577969` (IAM user `bob.esponja`), region `us-east-1`

## Question Answered: "Can I apply and run the workflow (today)?"

**No — not from the current state without prep work.** Reasons:

1. **Terraform not installed locally** (`terraform: command not found`).
   Either install it, or run `terraform apply` from CI.
2. **Terraform state has 0 managed resources** (never applied). The S3
   backend in `infra/environments/dev/providers.tf` is commented out.
3. **Terraform state backend not bootstrapped** — run
   `scripts/bootstrap-tf-state.sh` first to create the S3 state bucket +
   DynamoDB lock table, then uncomment the S3 backend block.
4. **Cognito pool `us-east-1_48bDiRJIZ` referenced in `frontend/.env` does
   NOT exist** in the current AWS account. Terraform must create a new pool
   (or the `.env` must be repointed to a pool that exists).
5. **CI/CD workflows only trigger on `main`** with path filters
   `backend/**` / `frontend/**` (`.github/workflows/backend.yml`,
   `frontend.yml`). After this cleanup those paths are correct again for the
   single-app layout — no path-filter changes needed.
6. **`DATABASE_URL` is not in SSM or Lambda env vars** — find/set it before
   running any SQL migration (e.g. the pre-diagnosis `ALTER TABLE`).

## Deployment To-Do (in order)

1. Install Terraform CLI (or run apply via CI).
2. `scripts/bootstrap-tf-state.sh` → create S3 state bucket + DynamoDB lock.
3. Uncomment S3 backend in `infra/environments/dev/providers.tf`, run
   `terraform init`.
4. `terraform apply` → creates Cognito pool, Lambda, API Gateway, S3 audio
   bucket (if kept), CloudFront.
5. Update `frontend/.env` + SSM params (`/cert-app/dev/cognito/*`) with the
   new Cognito pool config created by Terraform.
6. Set `DATABASE_URL` (Supabase) in GitHub repo secrets → Lambda env vars.
7. Run any pending SQL migration against Supabase
   (`SQLModel.metadata.create_all` only creates missing tables; for new
   columns use raw `ALTER TABLE`).
8. Push to `main` → CI/CD deploys backend Lambda + frontend S3/CloudFront.
9. Smoke test `/health` and the auth + questionnaire flow end-to-end.

## Active Plan Reference

Read [`DEPLOY_PLAN.md`](../../DEPLOY_PLAN.md) before any infra change. We are
still at "Phase 1: make backend deployable" — that phase is unstarted on
this clean `main`.

## Pre-existing Code Smells to Watch (not blockers)

- `StartProcessModal.tsx`: `saveFindings.isPending` / `generatePlan.isPending`
  reference plain async functions, not React Query mutations — `tsc` doesn't
  catch it under current loose checking.
- `.env` API endpoint (`ljux3dwmr0.execute-api...`) returns HTTP 000 — dead.
  Will be fixed once Terraform creates a real API Gateway.