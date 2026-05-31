CRITICAL Issues
1. Exposed Cognito Credentials in .env File
- Severity: Critical
- File: frontend/.env
- Issue: Real AWS Cognito credentials are committed to the repository
- Impact: Production authentication can be compromised; credentials must be rotated immediately
- Suggested Fix: Remove .env from git history, add to .gitignore, use .env.example template
- Reference: OWASP A01:2021 - Broken Access Control (https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
2. No Authorization Checks on User Endpoints
- Severity: Critical
- File: backend/src/routes/user/routes.py:26-54
- Issue: Any authenticated user can view or modify any other user's data via /users/{user_id}
- Impact: User data leakage and privacy violation; users can update others' profiles
- Suggested Fix: Add ownership check: if user_id != current_user_id and role != ADMIN: raise HTTPException(403)
@router.patch("/users/{user_id}")
async def update_user(user_id: UUID, update: UserUpdate, current_user: dict, repo: UserRepositoryPort):
    # Add authorization check
    if user_id != current_user["sub"] and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
3. Role Field Not Blocked in User Updates
- Severity: Critical
- File: backend/src/routes/user/routes.py:17-22
- Issue: UserUpdate model allows updating role field; users can elevate their own privileges
- Impact: Privilege escalation attack; any user can become admin
- Suggested Fix: Explicitly exclude role from updateable fields:
class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    gov_id: str | None = None
    is_active: bool | None = None
    # Note: role and user_id are intentionally excluded
4. Lambda Trigger Uses Deprecated Asyncio Pattern
- Severity: Critical
- File: backend/src/trigger/post_signup_trigger.py:35
- Issue: Uses asyncio.get_event_loop().run_until_complete() which is deprecated and fails in Python 3.12+
- Impact: Lambda function will crash on Python 3.12 runtime
- Suggested Fix: Use proper Lambda handler pattern:
def handler(event: dict, context: dict) -> dict:
    trigger_source = event.get("triggerSource", "")
    if trigger_source == "PostConfirmation_ConfirmSignUp":
        user_attrs = event.get("request", {}).get("userAttributes", {})
        # Use synchronous psycopg3 or boto3 with proper async handling
    return event
5. Missing Tests - No Test Coverage
- Severity: Critical
- File: backend/tests/, frontend/ (no tests found)
- Issue: All test files are empty; no unit or integration tests exist
- Impact: Cannot verify functionality; high risk of regressions; not production-ready
- Suggested Fix: Implement tests for all critical paths:
- Auth endpoints (success/failure cases)
- User CRUD operations
- JWT validation
- Repository layer
6. Global Mutable Engine State Not Thread-Safe
- Severity: Critical
- File: backend/src/adapters/db/user_repository.py:25-26
- Issue: _engine = None is a global mutable singleton; concurrent initialization is not safe
- Impact: Race conditions during startup; potential connection leaks
- Suggested Fix: Use fastapi.Depends with lifespan context or ensure single initialization:
_engine: AsyncEngine | None = None

def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL, echo=False)
    return _engine
HIGH Issues
7. CORS Overly Permissive Configuration
- Severity: High
- File: backend/src/main.py:18-22
- Issue: allow_credentials=True with allow_origins=["*"] (or localhost only) is risky
- Impact: Potential cross-origin attacks; browser may reject credentials with multiple origins
- Suggested Fix: Use specific origins list and verify in production:
COROSMiddleware(app, 
    allow_origins=["http://localhost:5173"],  # Only dev
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)
8. Broad Exception Catching in Auth
- Severity: High
- File: backend/src/routes/user/auth.py:22-24
- Issue: except Exception catches all errors, potentially leaking internal error details
- Impact: Information disclosure; internal architecture exposed to attackers
- Suggested Fix:
except jwt.ExpiredSignatureError:
    raise HTTPException(status_code=401, detail="Token expired")
except jwt.JWTClaimsError:
    raise HTTPException(status_code=401, detail="Invalid claims")
except Exception:
    raise HTTPException(status_code=401, detail="Invalid token")
9. Token Revocation Not Possible
- Severity: High
- File: backend/src/adapters/auth/cognito.py:16
- Issue: Decoded tokens cached for 5 minutes; if token is compromised, cannot be revoked
- Impact: Compromised tokens remain valid for up to 5 minutes
- Suggested Fix: Reduce TTL to 60 seconds or implement token blocklist
10. Unused cache_ttl Parameter
- Severity: High
- File: backend/src/adapters/auth/cognito.py:11
- Issue: cache_ttl parameter accepted but TTLCache uses hardcoded ttl=300
- Impact: Parameter is misleading; cache duration cannot be configured
- Suggested Fix: Use the parameter:
self.payload_cache = TTLCache(maxsize=1000, ttl=cache_ttl)
11. DATABASE_URL Exposed in Config
- Severity: High
- File: backend/src/config/settings.py
- Issue: Database credentials visible in settings; connection string may leak in logs/errors
- Impact: Database compromise if logs are exposed
- Suggested Fix: Mask sensitive parts in logs; use connection pooler URL format
12. Docker Compose Has Hardcoded Credentials
- Severity: High
- File: backend/docker-compose.yml:12
- Issue: postgres:postgres hardcoded in DATABASE_URL
- Impact: Weak default credentials in containerized environment
- Suggested Fix: Use environment variables or Docker secrets:
DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/sgi_pro
13. Lambda Trigger Has No Error Handling
- Severity: High
- File: backend/src/trigger/post_signup_trigger.py:24-40
- Issue: Database failures are silently ignored; no logging
- Impact: User creation fails but Lambda returns success; data inconsistency
- Suggested Fix: Add try/catch with proper error propagation and CloudWatch logging
MEDIUM Issues
14. Inconsistent Datetime Patterns
- Severity: Medium
- Files: Multiple files (user.py, user_repository.py, post_signup_trigger.py)
- Issue: Mix of datetime.utcnow(), datetime.now(), datetime.now(timezone.utc), and .isoformat()
- Impact: Timezone bugs; inconsistent timestamps across systems
- Suggested Fix: Standardize on datetime.now(timezone.utc) everywhere; remove deprecated utcnow()
15. SQL Echo Enabled in Production
- Severity: Medium
- File: backend/src/adapters/db/user_repository.py:27
- Issue: echo=True logs all SQL queries including potential sensitive data
- Impact: Performance degradation; sensitive data in logs
- Suggested Fix: Set echo=False or make conditional based on environment
16. Lambda Creates New DB Connection Per Invocation
- Severity: Medium
- File: backend/src/trigger/post_signup_trigger.py:44
- Issue: Creates asyncpg.connect() directly instead of using connection pooling
- Impact: Connection exhaustion under load; cold start latency
- Suggested Fix: Use connection pool from RDS Proxy or Lambda layer with pooled connections
17. Cognito Region Extraction Unreliable
- Severity: Medium
- File: frontend/src/lib/auth.ts:11
- Issue: Region extracted from user pool ID format; if format changes, silently breaks
- Impact: Auth failures if Cognito ID format changes
- Suggested Fix: Use explicit VITE_COGNITO_REGION env var
18. Password Sent in Plaintext (USER_PASSWORD_AUTH)
- Severity: Medium
- File: frontend/src/lib/auth.ts:25-30
- Issue: Uses USER_PASSWORD_AUTH flow sending password directly
- Impact: Password exposure if traffic intercepted
- Suggested Fix: Implement SRP (Secure Remote Password) flow or App-based auth
19. Dashboard Buttons Non-Functional
- Severity: Medium
- File: frontend/src/pages/dashboard/DashboardPage.tsx
- Issue: All action buttons (Iniciar Diagnóstico, Ver Documentos, etc.) have no handlers
- Impact: UX confusion; users expect functionality that doesn't exist
- Suggested Fix: Either implement or remove placeholder buttons
20. Inconsistent Error Message Language
- Severity: Medium
- Files: SignUpPage.tsx, ConfirmEmailPage.tsx
- Issue: Mixes Spanish ("El nombre es requerido") and English error messages
- Impact: Inconsistent user experience
- Suggested Fix: Choose one language (Spanish based on index.html lang="es")
21. Missing Pagination
- Severity: Medium
- File: backend/src/routes/user/routes.py
- Issue: User listing endpoints would return unbounded results
- Impact: Performance degradation with large datasets
- Suggested Fix: Add pagination with skip/limit query params and total count
LOW Issues
22. Empty Type Definitions File
- Severity: Low
- File: frontend/src/types.d.ts
- Issue: File is completely empty
- Impact: No type augmentation available
- Suggested Fix: Remove or add appropriate type declarations
23. Hardcoded Consultant Name
- Severity: Low
- File: frontend/src/components/landing/ConsultantSection.tsx:21
- Issue: "Juan Consultor" hardcoded instead of configurable
- Impact: Not reusable for other consultants
- Suggested Fix: Move to config or props
24. Magic Numbers Not Defined as Constants
- Severity: Low
- Files: ConfirmEmailPage.tsx (60, 2000), Stats.tsx (40, 25, 0.5)
- Issue: Numeric literals used without named constants
- Impact: Code harder to maintain
- Suggested Fix: Define descriptive constants (e.g., RESEND_COOLDOWN_SECONDS = 60)
25. Unused cors-any Dependency
- Severity: Low
- File: backend/pyproject.toml
- Issue: cors-any listed but FastAPI's built-in CORSMiddleware is used
- Impact: Unnecessary dependency
- Suggested Fix: Remove cors-any from dependencies
26. Lambda Uses Raw SQL Instead of SQLModel
- Severity: Low
- File: backend/src/trigger/post_signup_trigger.py:46-56
- Issue: Trigger uses raw SQL string while rest of app uses SQLModel
- Impact: Inconsistency; harder to maintain
- Suggested Fix: Use SQLModel for consistency
27. ConsultantSection Image Path Unknown
- Severity: Low
- File: frontend/src/components/landing/ConsultantSection.tsx
- Issue: Image path consultant.jpg doesn't exist in the codebase
- Impact: Broken image placeholder
- Suggested Fix: Add the image or use a different approach
Additional Recommendations
1. Add comprehensive tests - Priority #1 before any further development
2. Set up CI/CD - GitHub Actions for lint, typecheck, and test runs
3. Add database migrations - Use Alembic with SQLModel metadata
4. Implement rate limiting - Protect auth endpoints from brute force
5. Add request validation logging - Track failed validation attempts
6. Consider API versioning - /api/v1/ prefix for future compatibility
7. Add health check dependencies - /health should check DB and Cognito connectivity
Files with No Issues
- infra/ - Empty directory (no issues, just nothing there)
- frontend/src/components/ui/Button.tsx - Well implemented
- frontend/src/components/ui/Input.tsx - Well implemented
- frontend/src/components/auth/ProtectedRoute.tsx - Correct auth pattern
- frontend/src/lib/auth-config.tsx - Proper OIDC configuration