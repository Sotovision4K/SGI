# Migration Plan — VPC-less + Supabase

## Decision

Move from VPC + RDS Postgres to VPC-less Lambda + Supabase Postgres Free tier for prototype cost reduction (~$55/mo → ~$2-5/mo).

## Architecture

```
CloudFront → S3 (React frontend)
Cognito User Pool (Hosted UI + JWT)
API Gateway (/v1/**) → Lambda (VPC-less, Python 3.12, 120s timeout)
Lambda → Supabase (PgBouncer :6543, TLS)
Lambda → Anthropic API (HTTPS outbound)
```

| Component | Before | After |
|-----------|--------|-------|
| Database | RDS Postgres db.t4g.micro ($18-22/mo) | Supabase Free (500MB, pauses after 1wk) |
| Network | VPC + NAT Gateway + EIP (~$32/mo) | None (VPC-less Lambda) |
| Lambda | VPC-attached (private subnet) | VPC-less (direct internet) |
| Auth | Cognito User Pool | No change |
| API Gateway | REST API, authorization=NONE | No change (Authorizer deferred to Stop 2) |
| Frontend | S3 + CloudFront + OAC | No change |
| Anthropic | API key in Lambda env | No change |

## Supabase Connection String

**Session pooler (port 5432, IPv4)** — used for DDL bootstrap + full query support:
```
[REDACTED — Supabase connection string]
```

**Transaction pooler (port 6543)** — recommended for serverless runtime but does NOT support prepared statements or multi-statement DDL. Use only after tables exist and with `statement_cache_size=0`.

Stored as GitHub Actions secret `DATABASE_URL`, passed to Lambda env via Terraform.

## Tasks

### A. Terraform Infra Cleanup

- Delete `infra/modules/network/` — VPC, IGW, subnets, NAT, route tables, EIP
- Delete `infra/modules/rds/` — RDS instance, SG, subnet group, SSM parameter, random_password
- Edit `infra/modules/backend/main.tf`:
  - Remove `vpc_config {}` block (lines 77-80)
  - Remove `aws_security_group.lambda` (lines 101-117)
  - Remove `variable "vpc_id"` (lines 119-123)
  - Remove variable `subnet_ids` from `variables.tf`
  - Slim IAM policy: drop `ec2:*NetworkInterface` and `rds:DescribeDBInstances` statements
  - Keep `ssm:GetParameter` for Cognito config
  - Remove `lambda_security_group_id` from `outputs.tf`
- Edit `infra/environments/dev/main.tf`:
  - Remove `module "network"` block (lines 45-52)
  - Remove `module "rds"` block (lines 92-99)
  - Remove `aws_security_group_rule.rds_ingress_lambda` (lines 102-110)
  - Remove `subnet_ids` and `vpc_id` from `module "backend"` block
  - Update `database_url` to use Supabase connection string variable
  - Add `supabase_database_url` variable
- `terraform plan` → clean, no VPC/RDS/NAT resources

### B. Supabase Setup (Manual)

- Project created in Supabase dashboard: `fbfdzppjoigufbgfjfzp`
- PgBouncer enabled on port 6543
- Connection verified via Supabase SQL editor
- GitHub Actions secret `DATABASE_URL` added

### C. GitHub Actions Updates

- `backend.yml`:
  - Already packages `.venv` site-packages ✅ (lines 62-73)
  - Already uploads to S3 ✅ (line 92)
  - Already updates Lambda function code ✅ (lines 94-99)
  - Already smoke tests `/health` ✅ (lines 131-145)
  - ADD: Set `DATABASE_URL` env var on Lambda (same pattern as ANTHROPIC_API_KEY in lines 104-126)
  - ADD: Update `CORS_ALLOW_ORIGINS` env var from SSM or secret

### D. Verification

- `terraform apply` → Lambda + API Gateway + Cognito + frontend only
- `curl /v1/health` → 200
- Login via CloudFront → `/processes` returns 200
- Tables created on cold start via `SQLModel.metadata.create_all` in lifespan

## Deferred to Stop 2

- S3 + DynamoDB Terraform state backend
- Cognito API Gateway authorizer + CORS preflight
- GitHub Actions OIDC swap
- Action SHA pinning
- Frontend reconnection double-check

## Risks

1. **R-1** Lambda zip missing `.venv` site-packages → silently broken deploy (existing issue, already fixed in CI)
2. **R-2** CORS: ensure `CORS_ALLOW_ORIGINS` set to CloudFront domain
3. **R-3** Supabase Free pause → first request after 7-day idle takes ~5-10s (accepted)
4. **R-4** PgBouncer + `create_all` works, but future Alembic migrations must target `:5432`
5. **R-5** In-code JWT only (no API Gateway authorizer) for now
6. **R-6** `DATABASE_URL` in Lambda env vars is visible in console — fine for prototype

## Environment (before migration)

- Frontend: CloudFront `d2serffuuhhcig.cloudfront.net`
- Backend: Lambda `cert-app-dev-api` via API Gateway `ljux3dwmr0`
- Auth: Cognito User Pool `us-east-1_W3Ne8RhL8`, Client `3cp84bg1r4ns830bj1vb6fbrqf`
- DB: RDS PostgreSQL `cert-app-dev-db.c2rmas8220rb.us-east-1.rds.amazonaws.com`
- S3 backup: `s3://cert-app-dev-frontend/lambdas/function.zip`

Last updated: 2026-07-01

---

## Agent Review Summary (2026-07-01)

Four agents reviewed the migration plan before implementation:

| Agent | Verdict | Critical Issues Found |
|-------|---------|----------------------|
| **Architect** | ✅ Approve | PgBouncer DDL incompatibility, asyncpg prepared-statements, credential exposure |
| **Security Auditor** | ⚠️ Conditional | CI credential leak (get-function-configuration), long-lived IAM keys, no APIGW authorizer |
| **AWS Infra Engineer** | ✅ Go (with fixes) | PgBouncer transaction mode + DDL, Supabase 1-week pause, APIGW 29s timeout |
| **Terraform Specialist** | ✅ Clean | Empty state (no migration risk), vpc_id in main.tf, dead IAM policies, missing validation |

### Fixes Applied in Tasks A-C

| Fix | Task | Description |
|-----|------|-------------|
| Port 5432 (session pooler) | B | Supports DDL/PREPARE — avoids PgBouncer transaction-mode breakage |
| `statement_cache_size=0` | B | Disables asyncpg prepared-statement cache for PgBouncer compat |
| `pool_size=1, max_overflow=2` | B | Serverless-friendly pool sizing |
| `timeout: 15` | B | Handles Supabase cold starts |
| `pool_recycle=300` | B | Avoids Supabase idle connection limits |
| Remove CI env var leak | C | Deleted `get-function-configuration` pattern — Terraform sets all env vars |
| Remove vpc_id from main.tf | A | Was inline in main.tf, not variables.tf |
| Remove dead IAM policies | A | VpcAccess, RdsDescribe, RdsDatabaseUrlAccess removed |
| `database_url` required | A | No default `""` — fails at plan time if unset |
| `validation {}` on database_url | A | Catches misconfigured connection strings |
| Remove `random` provider | A | Only used by deleted RDS module |
| Update README | A | Architecture diagram, module table, file structure
