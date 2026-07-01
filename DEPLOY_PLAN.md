# AWS Deployment Plan — SGI Pro

> ⚠️ **Phase 2 (VPC + RDS) has been superseded** by the Supabase migration plan in [`checkpoint.md`](./checkpoint.md). See branch `vpc-less-infra` for the in-progress migration.

This plan covers getting the SGI Pro app (FastAPI backend on Lambda + React/Vite frontend on CloudFront) running on AWS with VPC-less Lambda, CloudFront frontend, Cognito auth, API Gateway, and Supabase Postgres Free tier. The goal is a working dev environment in `us-east-1` reachable via the CloudFront default domain.

---

## Decisions Confirmed

| Decision | Choice | Notes |
|----------|--------|-------|
| API Gateway auth | **Cognito User Pool Authorizer + keep in-code JWT validation** | Defense-in-depth. JWT validation in `get_current_user` stays. |
| API Gateway VPC | **Skip for now** | Can be added later if private API endpoint is needed. |
| Terraform state | **S3 backend + DynamoDB lock table, manual bootstrap script** | Run `scripts/bootstrap-tf-state.sh` once before first `terraform apply`. |
| Anthropic API key | **GitHub Actions secret → Lambda env var on deploy** | No SSM/Secrets Manager for now. |
| RDS bootstrap | **Option A: `SQLModel.metadata.create_all` in `lifespan`** | Cold start penalty ~2-5s. Migrate to Alembic before production. **(Superseded by Supabase)** |
| Database | **RDS Postgres db.t4g.micro, single-AZ, 20GB GP3, private subnet** | Free-tier eligible. **(Superseded by Supabase)** |
| Lambda timeout | **120s** (was 30s — LLM calls need it) | |
| CloudFront | **Default domain only** (no custom domain, no Route53, no ACM) | |
| Region / env | **us-east-1, single `dev` environment** | |
| Post-deploy check | **curl `/health` smoke test in CI** | |

---

## Current State (audit results)

### What exists
- ✅ Terraform modules: `network`, `cognito`, `frontend`, `iam`, `backend`
- ✅ Frontend workflow: build → S3 → CloudFront invalidation
- ✅ Backend workflow: test → package → upload to S3 (but does NOT update Lambda)
- ✅ GitHub Actions OIDC role for AWS (defined in `iam` module, but workflows still use long-lived keys)
- ✅ CloudFront + S3 + OAC for frontend
- ✅ Cognito User Pool with parameterised callback URLs
- ✅ SSM parameters for Cognito config (consumed by frontend workflow)

### What's broken or missing
- ❌ **No `backend/handler.py`** — Terraform expects `handler.handler` but it doesn't exist
- ❌ **No RDS** — backend code uses Postgres but no DB is provisioned
- ❌ **API Gateway has no Cognito Authorizer** — `authorization = "NONE"`
- ❌ **Backend workflow only uploads to S3** — doesn't call `aws lambda update-function-code`
- ❌ **Lambda env vars are empty** — no `DATABASE_URL`, `ANTHROPIC_API_KEY`, Cognito settings
- ❌ **CORS hardcoded to localhost** — `main.py:34` has `allow_origins=["http://localhost:5173", "http://localhost:3000"]`
- ❌ **Lambda zip missing dependencies** — workflow zips source but not `.venv` site-packages
- ❌ **RDS bootstrap not handled** — tables never get created
- ❌ **Lambda on public subnet** — needs private subnet + NAT to reach Anthropic + RDS

---

## Execution Plan

### STOP 1 — Phases 1 & 2 (Test environment reachable)

**Goal:** `curl https://<api-id>.execute-api.us-east-1.amazonaws.com/v1/health` returns 200, RDS schema is created, login flow works end-to-end against the deployed app.

#### Phase 1 — Make the backend deployable

| # | Task | Test | Files |
|---|------|------|-------|
| 1.1 | Create `backend/handler.py` wrapping `src.main:app` with Mangum | ✅ `tests/unit/test_handler.py` | `backend/handler.py` (new) |
| 1.2 | Fix Lambda packaging in `backend.yml` to include `.venv` site-packages | smoke test in CI | `.github/workflows/backend.yml` |
| 1.3 | Wire `DATABASE_URL`, `ANTHROPIC_API_KEY`, Cognito settings into Lambda env in Terraform | smoke test in CI | `infra/modules/backend/main.tf` |
| 1.4 | Bump Lambda timeout 30s → 120s | — | `infra/modules/backend/variables.tf` |
| 1.5 | Make CORS configurable via `CORS_ALLOW_ORIGINS` env var | ✅ `tests/unit/test_main.py` | `backend/src/main.py` |
| 1.6 | Extend `lifespan` to call `SQLModel.metadata.create_all` | ✅ `tests/unit/test_main.py` | `backend/src/main.py` |

**Test 1.1 — handler.py:**
```python
# Asserts: handler.handler({}, {}) returns {"statusCode": int, "body": str}
# Asserts: handler.handler({"httpMethod": "GET", "path": "/health"}, {}) returns 200
```

**Test 1.5 — CORS:**
```python
# Asserts: with CORS_ALLOW_ORIGINS="https://x.cloudfront.net", origins = ["https://x.cloudfront.net"]
# Asserts: with CORS_ALLOW_ORIGINS unset, falls back to localhost defaults
```

**Test 1.6 — lifespan:**
```python
# Asserts: lifespan calls SQLModel.metadata.create_all (mocked)
# Asserts: lifespan still pings DB on startup (existing behavior)
```

#### Phase 2 — Add the database — ⚠️ SUPERSEDED

> **This phase has been superseded.** RDS Postgres has been replaced by Supabase Postgres Free tier in a VPC-less architecture. See [`checkpoint.md`](./checkpoint.md) for the Supabase migration plan and branch `vpc-less-infra` for the in-progress work. Historical content preserved below for reference — do not implement as written.

| # | Task | Files |
|---|------|-------|
| 2.1 | Add private subnets (1 per AZ) to `network` module | `infra/modules/network/main.tf` |
| 2.2 | Add NAT Gateway to network module (so Lambda in private subnet can reach Anthropic + AWS APIs) | `infra/modules/network/main.tf` |
| 2.3 | Create `infra/modules/rds/` — subnet group, SG (only Lambda SG can connect on 5432), db.t4g.micro, 20GB GP3, random password in SSM | `infra/modules/rds/main.tf` (new), `variables.tf` (new), `outputs.tf` (new) |
| 2.4 | Wire RDS into `environments/dev/main.tf`; move Lambda from public subnet to private subnet | `infra/environments/dev/main.tf` |
| 2.5 | Update `iam` module: grant Lambda `rds:DescribeDBInstances`, `ec2:DescribeNetworkInterfaces`, `ec2:CreateNetworkInterface` (for VPC) | `infra/modules/iam/main.tf` |
| 2.6 | Wire `DATABASE_URL` into Lambda env from SSM | `infra/modules/backend/main.tf` |

**RDS Module spec:**
- `aws_db_subnet_group` — references the new private subnets
- `aws_security_group` — inbound 5432 only from Lambda SG, outbound all
- `aws_db_instance` — `db.t4g.micro`, `engine = "postgres"`, `engine_version = "15"`, `allocated_storage = 20`, `storage_type = "gp3"`, `username = "sgi"`, `password = random_password`, `skip_final_snapshot = true`, `publicly_accessible = false`
- `aws_ssm_parameter` for the connection URL (SecureString, decrypted by Lambda IAM)
- Output: `db_url` (password interpolated)

#### Phase 2.5 — Backend workflow updates

| # | Task | Files |
|---|------|-------|
| 2.5.1 | After S3 upload, run `aws lambda update-function-code --function-name ... --s3-bucket ... --s3-key ...` | `.github/workflows/backend.yml` |
| 2.5.2 | Add post-deploy `curl -f <api-url>/health` job; fail workflow if non-200 | `.github/workflows/backend.yml` |
| 2.5.3 | Read `DATABASE_URL` from SSM in workflow and pass to Lambda env (alternative: just pass in env vars and Terraform looks up from SSM) | `.github/workflows/backend.yml` |

#### Stop 1 verification

1. `terraform apply` succeeds — RDS, VPC, NAT, Lambda, API Gateway all created
2. `backend.yml` CI succeeds:
   - Tests pass
   - Lambda zip uploaded to S3
   - `lambda update-function-code` succeeds
   - `curl /health` returns 200
3. Manual: open the CloudFront URL in a browser, log in via Cognito, land on `/processes` (empty list is fine)
4. Manual: log in → confirm a `/processes` API call works (network tab shows 200)

**→ Then stop and check with the user before continuing to Stop 2.**

---

### STOP 2 — Phases 3, 4, 5, 6 (Hardening + production-ready)

#### Phase 3 — S3 + DynamoDB for Terraform state

| # | Task | Files |
|---|------|-------|
| 3.1 | Create `scripts/bootstrap-tf-state.sh` — creates S3 bucket (`cert-app-dev-tfstate`) with versioning + encryption, DynamoDB table (`cert-app-dev-tfstate-lock`) for state locking | `scripts/bootstrap-tf-state.sh` (new) |
| 3.2 | Update `infra/environments/dev/providers.tf` to use S3 backend (commented out until bootstrap is run) | `infra/environments/dev/providers.tf` |

```hcl
# After running scripts/bootstrap-tf-state.sh, uncomment:
# backend "s3" {
#   bucket         = "cert-app-dev-tfstate"
#   key            = "dev/terraform.tfstate"
#   region         = "us-east-1"
#   dynamodb_table = "cert-app-dev-tfstate-lock"
#   encrypt        = true
# }
```

#### Phase 4 — Secure API Gateway (Cognito Authorizer)

| # | Task | Files |
|---|------|-------|
| 4.1 | Add `aws_api_gateway_authorizer` of type `COGNITO_USER_POOLS` in `backend` module | `infra/modules/backend/main.tf` |
| 4.2 | Change `aws_api_gateway_method.any.authorization = "COGNITO_USER_POOL"` with `authorizer_id` | `infra/modules/backend/main.tf` |
| 4.3 | Add an `OPTIONS` method on the proxy with `authorization = "NONE"` for CORS preflight | `infra/modules/backend/main.tf` |
| 4.4 | Add `aws_api_gateway_integration_response` + `method_response` for CORS headers (`Access-Control-Allow-Origin`, `-Methods`, `-Headers`) | `infra/modules/backend/main.tf` |
| 4.5 | Make `/health` public: add a separate `aws_api_gateway_resource` + `aws_api_gateway_method` for the root path with `authorization = "NONE"`, integrated to the same Lambda | `infra/modules/backend/main.tf` |

**Keep in-code JWT validation** as defense-in-depth. The Cognito Authorizer at the gateway is the first line; `get_current_user` in `src/routes/user/auth.py` validates again.

#### Phase 5 — GitHub Actions completion

| # | Task | Files |
|---|------|-------|
| 5.1 | Swap `DEV_AWS_ACCESS_KEY_ID/SECRET` for OIDC `role-to-assume` in both workflows | both `.github/workflows/*.yml` |
| 5.2 | Add `infra.yml` workflow: `terraform plan` on PR, `terraform apply` on main push to `infra/**` | `.github/workflows/infra.yml` (new) |
| 5.3 | Pin all action versions to commit SHAs (e.g., `actions/checkout@b4ffde65f...` instead of `@v4`) | both workflows |
| 5.4 | Add `environment: dev` with required reviewers for `apply` job | `.github/workflows/infra.yml` |

#### Phase 6 — Frontend reconnection

| # | Task | Files |
|---|------|-------|
| 6.1 | Verify `VITE_API_BASE_URL` is set in `frontend.yml` to the API Gateway invoke URL | `.github/workflows/frontend.yml` |
| 6.2 | Verify Cognito callback URLs include the CloudFront domain (already parameterised via `var.frontend_origin`) | `infra/modules/cognito/variables.tf` |
| 6.3 | Verify backend CORS allow-list includes the CloudFront origin (covered by 1.5) | — |
| 6.4 | Add `VITE_COGNITO_DOMAIN` SSM parameter (currently only user pool id, client id, region — domain is hardcoded) | `infra/modules/cognito/main.tf` |

---

## Test Plan (TDD)

For each fix, write the test first, then implement.

### Stop 1 tests to add
1. `backend/tests/unit/test_handler.py` — Mangum handler returns valid API Gateway response
2. `backend/tests/unit/test_main.py` — CORS reads `CORS_ALLOW_ORIGINS` env var; `lifespan` calls `create_all`
3. Integration test for Lambda zip packaging (smoke test in CI): unzip the artifact and check that `fastapi` is importable

### Stop 2 tests to add
- Pin action SHAs → no functional test, just verification that the workflow runs
- Cognito Authorizer → no automated test, manual verification (deploy + check that `/health` is reachable without auth, but `/processes` returns 401)

### Manual verification checklist
- [ ] `terraform apply` runs cleanly
- [ ] RDS is reachable from inside the VPC (e.g., via a one-off psql in an EC2 bastion, or via a Lambda test)
- [ ] `curl https://<api-url>/health` returns 200 (no auth required)
- [ ] `curl https://<api-url>/api/v1/users/me` returns 401 without JWT
- [ ] Login via CloudFront URL works end-to-end
- [ ] `/processes` page loads after login
- [ ] DB tables are created on first Lambda cold start

---

## File Inventory

### New files (Stop 1)

> **Note:** On the `vpc-less-infra` branch, `infra/modules/rds/` and `infra/modules/network/` are being removed (Supabase VPC-less architecture makes them unnecessary).

- `backend/handler.py`
- `backend/tests/unit/test_handler.py`
- `backend/tests/unit/test_main.py`
- `infra/modules/rds/main.tf` ← removed on `vpc-less-infra`
- `infra/modules/rds/variables.tf` ← removed on `vpc-less-infra`
- `infra/modules/rds/outputs.tf` ← removed on `vpc-less-infra`

### Modified files (Stop 1)
- `backend/src/main.py` (CORS env, lifespan create_all)
- `infra/modules/backend/main.tf` (env vars, timeout, VPC config)
- `infra/modules/backend/variables.tf` (timeout default)
- `infra/modules/network/main.tf` (private subnets, NAT) ← module removed on `vpc-less-infra`
- `infra/modules/iam/main.tf` (RDS describe, EC2 network interfaces)
- `infra/environments/dev/main.tf` (RDS module, Lambda in private subnet)
- `.github/workflows/backend.yml` (fix zip, env vars, lambda update, smoke test)

### New files (Stop 2)
- `scripts/bootstrap-tf-state.sh`
- `.github/workflows/infra.yml`

### Modified files (Stop 2)
- `.github/workflows/backend.yml` (OIDC, action SHAs)
- `.github/workflows/frontend.yml` (OIDC, action SHAs)
- `infra/environments/dev/providers.tf` (S3 backend)
- `infra/modules/backend/main.tf` (Cognito authorizer, CORS OPTIONS)
- `infra/modules/cognito/main.tf` (cognito_domain SSM parameter)

**Total:** ~7 new files, ~12 modified files, ~4 new tests.

---

## Risks (most important first)

1. **R-1 — Lambda zip without deps.** Current deploy is silently broken. Fix is critical (Phase 1.2).
2. **R-2 — VPC routing.** ~~If Lambda in private subnet can't reach RDS, all DB calls fail. Architecture must be correct from day one (Phase 2.1-2.4).~~ **IRRELEVANT** — No VPC routing needed with Supabase (VPC-less Lambda architecture).
3. **R-3 — Cold start timeout.** 120s is the new limit. Anthropic calls can take 30-60s for long plans. Should be enough, but watch.
4. **R-4 — CORS blocking frontend.** Without CORS fix, deployed frontend cannot reach API. Deployed app looks like it works but every API call fails.
5. **R-5 — Cognito Authorizer + CORS preflight.** When you add the authorizer, OPTIONS preflight must still be `NONE` or browsers will block requests. Easy to miss.

---

## Open Questions (resolved)

- ✅ API Gateway auth: Cognito Authorizer + keep in-code JWT
- ✅ API Gateway VPC: skip for now
- ✅ Terraform state: S3 + DynamoDB, manual bootstrap
- ✅ Anthropic key: GitHub Secrets → Lambda env var
- ✅ RDS bootstrap: `SQLModel.metadata.create_all` in `lifespan`
- ✅ Single env, us-east-1, CloudFront default domain
- ✅ Add post-deploy `/health` smoke test
- ✅ RDS sizing: db.t4g.micro, single-AZ

---

## Next Session — Start Here

1. **Confirm this plan** is still accurate
2. **Check whether Stop 1 is already done** — `ls backend/handler.py`, `grep SQLModel.metadata.create_all backend/src/main.py`
3. **Begin Stop 1, Phase 1.1** — write `test_handler.py` first, then create `handler.py`
4. **Work in TDD style** — test → fail → implement → test → pass
5. **After Stop 1, verify end-to-end** (curl /health, login via CloudFront)
6. **Then ask the user before proceeding to Stop 2**

---

## Reference

- Backend: FastAPI 0.136, Pydantic 2.10, SQLModel, psycopg[binary], mangum 0.17+
- Frontend: React 19 + Vite + TypeScript, react-oidc-context 3.3
- Auth: AWS Cognito (User Pool + Hosted UI + JWT)
- LLM: Anthropic Claude via official SDK
- Infra: Terraform 1.5+, modules in `infra/modules/`
- CI: GitHub Actions with OIDC to AWS

Last updated: 2026-07-01
