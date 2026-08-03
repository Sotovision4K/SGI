

---
description: Create a FastAPI endpoint following TDD, security, and project standards.
---

# Create Endpoint Workflow

## Input Parameters
- **Name** (`$1`): Endpoint identifier (e.g., `get_certifications`, `create_user_profile`)
- **Arguments** (`$2`): Comma-separated params (e.g., `user_id:str, status:Optional[str]`)
- **Path** (`$3`): File path or route (e.g., `backend/src/routes/certifications.py` or `/api/v1/certifications`)

## Pre-Generation Validation

### 1. Path Resolution
- If `$3` is not an existing file or folder, ask:
  - "Are we creating a **new route file** or adding to an **existing module**?"
  - Suggest path: `backend/src/routes/{domain}/{endpoint_name}.py`

### 2. Duplicate Detection
- Search existing endpoints in `backend/src/routes/` and `backend/src/main.py`
- **STOP if endpoint already exists** — suggest modifying instead
- Check for similar functionality (e.g., `GET /users/{id}` vs `GET /users/{user_id}`)

### 3. Requirements Clarification
Ask the user:
- **HTTP Method**: GET, POST, PUT, DELETE, PATCH?
- **Auth Required**: Public, Authenticated (JWT), Role-based?
- **Database Operation**: Read-only, Create, Update, Delete?
- **External Dependencies**: Anthropic API, S3, etc.?
- **Expected Status Codes**: 200, 201, 400, 401, 403, 404, 500?

## TDD Phase (Use `.opencode/prompts/tdd-developer.txt`)

### Write Failing Test First
Create test file: `backend/tests/routes/test_{endpoint_name}.py`

Template:
```python
# filepath: backend/tests/routes/test_{endpoint_name}.py
import pytest
from fastapi.testclient import TestClient
from backend.src.main import app

client = TestClient(app)

@pytest.mark.asyncio
async def test_{endpoint_name}_success():
    """Test successful endpoint execution"""
    response = client.{http_method}(
        "/api/v1/{path}",
        json={...},  # or params={...}
        headers={"Authorization": "Bearer {token}"}  # if auth required
    )
    assert response.status_code == 200  # or 201
    assert response.json()["data"] == {...}

@pytest.mark.asyncio
async def test_{endpoint_name}_missing_auth():
    """Test missing authentication"""
    response = client.{http_method}("/api/v1/{path}")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_{endpoint_name}_invalid_input():
    """Test validation error"""
    response = client.{http_method}(
        "/api/v1/{path}",
        json={"invalid_field": "..."}
    )
    assert response.status_code == 422
```

**Run test (expect failure)**:
```bash
cd backend && python -m pytest tests/routes/test_{endpoint_name}.py -v
```

## Implementation Phase

### 1. Create Route Module (if new)
```python
# filepath: backend/src/routes/{domain}/{endpoint_name}.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlmodel import Session
from backend.src.config.settings import settings
from backend.src.db import get_session
from backend.src.auth import get_current_user
from backend.src.models import User
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/{domain}", tags=["{domain}"])

class {EndpointName}Request(BaseModel):
    """Request schema - use Zod v4 for frontend validation"""
    field1: str = Field(..., min_length=1)
    field2: Optional[str] = Field(None)

class {EndpointName}Response(BaseModel):
    """Response schema"""
    data: dict
    message: str
    status_code: int

@router.{http_method}("/{endpoint_path}", response_model={EndpointName}Response)
async def {endpoint_name}(
    request: {EndpointName}Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),  # if auth required
):
    """
    {Brief description of endpoint}
    
    - **Responsibility**: Single, focused action (KISS principle)
    - **Idempotency**: {Describe idempotency strategy, if applicable}
    - **Auth**: {Public / JWT Required / Role-based}
    - **Timeout handling**: Returns 202 if external service timeout (async processing)
i need    - **Timeout handling**: Returns 202 if external service timeout (async processing)

    """
    try:
        # Your implementation
        result = {...}
        
        return {EndpointName}Response(
            data=result,
            message="Success",
            status_code=200
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )
```

### 2. Register Route in `main.py`
```python
# filepath: backend/src/main.py
from backend.src.routes.{domain}.{endpoint_name} import router as {endpoint_name}_router

app.include_router({endpoint_name}_router)
```

### 3. Design Considerations

**KISS & Single Responsibility**:
- One action per endpoint
- Keep function under 30 lines (extract helpers)
- Use descriptive variable names

**Readability Over Efficiency**:
- Explicit type hints (no `Any`)
- Clear error messages
- Comments on complex logic

**Idempotency**:
- For POST: Use `INSERT ... ON CONFLICT DO UPDATE` or check existing resource
- For PUT/PATCH: Idempotent by default (same payload = same result)
- For DELETE: Return 204 or 200 (idempotent if called multiple times)

**Database Operations**:
- Use SQLModel for type-safe queries
- Reference schema in `.opencode/docs/authentication.cognito.md`
- Use `get_session()` dependency from `backend/src/db.py`

## Post-Generation Validation

### 4. Security Audit (Use `.opencode/prompts/security-auditor.txt`)
Run security checks:
```bash
cd backend && python -m pytest tests/routes/test_{endpoint_name}.py -v
# Then execute security-auditor prompt
```

**Common fixes**:
- ✅ JWT validation: `get_current_user` dependency
- ✅ Input sanitization: Zod schemas + Pydantic validation
- ✅ Rate limiting: Add `@limiter.limit()` if high-volume endpoint
- ✅ CORS: Check `CORS_ALLOW_ORIGINS` in `backend/src/config/settings.py`
- ✅ SQL Injection: Always use SQLModel ORM, never raw SQL strings
- ✅ Error logging: Log suspicious input/auth failures

If security-auditor fails → use **DeepSeek V4 Free Flash** to resolve.

### 5. Run Full Test Suite
```bash
cd backend && python -m pytest tests/ -v --cov
```

Ensure:
- All tests pass ✅
- New endpoint test passes ✅
- No regression in existing tests ✅
- Code coverage maintained (target: >80%)

### 6. Code Quality Checks
```bash
make lint         # Run ruff + eslint
make typecheck    # mypy on backend (if enabled)
```

## Documentation

### OpenAPI/Swagger
FastAPI auto-generates docs at `/docs`. Ensure:
- Docstring is clear
- Request/response schemas are defined
- Status codes are explicit: `@router.get(..., responses={200: {...}, 401: {...}})`

### Changelog Entry (if applicable)
```markdown
## [Unreleased]
### Added
- `POST /api/v1/{domain}/{endpoint_name}` - {Brief description}
  - Auth: {Required/Optional}
  - Returns: {EndpointName}Response
```

## Example: Create User Profile Endpoint

```bash
create_endpoint "create_user_profile" "user_id:str, first_name:str, last_name:str" "backend/src/routes/users/create_profile.py"
```

Expected output:
1. ✅ Test file created (failing)
2. ✅ Route module created
3. ✅ Registered in `main.py`
4. ✅ Security audit passed
5. ✅ Tests passing
6. ✅ Linting passed

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Endpoint already exists" | Modify existing or suggest wrapper |
| Security audit fails | Apply suggestions or use fallback model |
| Test fails after implementation | Review TDD test expectations |
| Lint errors | Run `make lint --fix` |
| Import errors | Check route registration in `main.py` |
| Auth failures | Verify `get_current_user` logic in `backend/src/auth.py` |

---
**Stack Reminders**:
- FastAPI skill: `.opencode/skills/fastapi/SKILL.md`
- Auth spec: `.opencode/docs/authentication.cognito.md`
- Deployment: `DEPLOY_PLAN.md` (Lambda + API Gateway)
- Package manager: pnpm (frontend only)