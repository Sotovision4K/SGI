# Debugging Checkpoint — June 29, 2026

## Current Issue: 422 on API calls with Authorization header

### Symptom
Any GET request to router endpoints (e.g., `/api/v1/processes`, `/api/v1/users`) with an `Authorization: Bearer {token}` header returns **422** with body validation errors. Without the header, it returns 401 "Not authenticated" (correct). The `/health` endpoint (app-level, not in a router) works fine with or without the header.

```
GET /v1/api/v1/processes + Authorization: Bearer test → 422
  {"detail":[{"type":"missing","loc":["body"],"msg":"Field required","input":null}]}

GET /v1/api/v1/processes (no header) → 401 "Not authenticated" ✅
GET /v1/api/v1/health + Authorization: Bearer test → 200 ✅
```

### What We Know
- **Affects ALL router endpoints** (processes, users, companies), but NOT `@app.get("/health")`
- **Only with `Authorization: Bearer {non-empty}`** header — invalid formats like `Authorization: x` or empty `Bearer ` work fine (401)
- **Not a Mangum body handling issue** — Mangum v0.21.0 correctly converts `body: null` to `b""`
- **Not a Cognito callback issue** — sign-in flow works end-to-end
- **The code in the repo does NOT have models with `settings` or `payload` fields** — these are coming from old deployed code or a library

### Root Cause Theory
FastAPI's dependency injection (specifically `HTTPBearer` when extracting the `Authorization` header) triggers request body consumption on router endpoints. The body from API Gateway proxy is `null` → Mangum converts to `b""` → FastAPI/Starlette still tries to parse it → 422. This only happens on router endpoints because the dependency chain (`CurrentUserDep` → `get_current_user` → `HTTPBearer`) is unique to route handlers.

### What Was Fixed (Working)
| Issue | Fix | Status |
|-------|-----|--------|
| `invalid_grant` on sign-in | Added `email_verified` + `phone_number_verified` to Cognito `read_attributes` (TF) | ✅ |
| Users stuck on LandingPage after sign-in | Changed `VITE_REDIRECT_URI` to `/auth/signin` | ✅ |
| No post-logout redirect | Added `post_logout_redirect_uri` to OIDC config | ✅ |
| Duplicate `createRoot` in `main.tsx` | Removed duplicate (caused `removeChild` DOM error) | ✅ |
| Debug logging in production | Removed `Log.DEBUG` and `localStorage` hack from `auth-config.tsx` | ✅ |
| Cognito callback mismatch | Added both `/` and `/auth/signin` to callback_urls | ✅ |

### Files Modified (unpushed commits on main)
1. `backend/src/main.py` — Added `FixGatewayBody` ASGI middleware (NOT YET DEPLOYED/TESTED)
2. `backend/handler.py` — Reverted to simple `handler = Mangum(app)` 
3. `infra/modules/cognito/main.tf` — Added `email_verified`, `phone_number_verified` to `read_attributes`
4. `infra/environments/dev/main.tf` — Changed callback_urls to include both `/` and `/auth/signin`
5. `frontend/src/lib/auth-config.tsx` — Cleaned up, removed debug code, added `post_logout_redirect_uri`
6. `frontend/src/main.tsx` — Fixed duplicate `createRoot`, removed debug logging
7. `frontend/src/pages/register/SignInPage.tsx` — Deep-link support from `state.from`
8. `frontend/.env` — Updated `VITE_REDIRECT_URI` to match `/auth/signin`
9. `.github/workflows/frontend.yml` — Changed `VITE_REDIRECT_URI` and fixed authority domain

### Next Steps (in order)

#### 1. Test the ASGI middleware fix
The `FixGatewayBody` middleware in `main.py` intercepts the ASGI receive channel and forces empty body bytes on GET/HEAD/DELETE/OPTIONS. Needs to be deployed and tested:
```bash
# Package and deploy (same as CI does)
cd /mnt/c/Users/sotov/OneDrive/Escritorio/cert_app
rm -rf /tmp/lambda-pkg && mkdir -p /tmp/lambda-pkg/lambda
cp -r backend/src /tmp/lambda-pkg/lambda/
cp backend/handler.py /tmp/lambda-pkg/lambda/
mkdir -p /tmp/lambda-pkg/lambda/.venv/lib/python3.12
cp -r backend/.venv/lib/python3.12/site-packages /tmp/lambda-pkg/lambda/.venv/lib/python3.12/
# ... zip and upload to S3, update Lambda, redeploy API Gateway
```

#### 2. If middleware doesn't work, try:
- Removing `CORSMiddleware` temporarily to isolate
- Adding `response_model` None to check if validation is the trigger
- Checking if FastAPI 0.136.x has a known bug with HTTPBearer + GET requests
- Trying `fastapi>=0.115.5` (newer patch)

#### 3. Push all commits
```powershell
git push
```

### Environment
- **Frontend**: CloudFront `d2serffuuhhcig.cloudfront.net`
- **Backend**: Lambda `cert-app-dev-api` via API Gateway `ljux3dwmr0`
- **Auth**: Cognito User Pool `us-east-1_W3Ne8RhL8`, Client `3cp84bg1r4ns830bj1vb6fbrqf`
- **DB**: RDS PostgreSQL `cert-app-dev-db.c2rmas8220rb.us-east-1.rds.amazonaws.com`
- **S3 backup**: `s3://cert-app-dev-frontend/lambdas/function.zip` (last good Lambda package)
