import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlmodel import SQLModel, text

from src.config.settings import get_settings
from src.routes.user.routes import router as users_router
from src.routes.processes.routes import router as processes_router
from src.routes.companies.routes import router as companies_router
from src.routes.questionnaires.routes import router as questionnaires_router
from src.adapters.db.user_repository import get_engine

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure settings load — missing env vars or unreachable DB must not
    # crash the app, otherwise even /health returns 502.
    try:
        settings = get_settings()
    except ValidationError as e:
        logger.error("Settings validation failed — app starting without DB: %s", e)
        yield
        return

    try:
        engine = get_engine(settings.database_url)
        async with engine.begin() as conn:
            await conn.run_sync(lambda sync_conn: sync_conn.execute(text("SELECT 1")))
        # Bootstrap DB schema on first cold start
        async with engine.begin() as conn:
            await conn.run_sync(lambda sync_conn: SQLModel.metadata.create_all(sync_conn))
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error("Database initialization failed — app starting without DB: %s", e)
    yield


def _parse_cors_origins(raw: str | None) -> list[str]:
    """Parse CORS_ALLOW_ORIGINS env var into a list of origins."""
    if not raw:
        return ["http://localhost:5173", "http://localhost:3000"]
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(
    title="SGI Pro API",
    description="Backend API for SGI Pro - ISO Management System Certification Tool",
    version="0.1.0",
    lifespan=lifespan,
    root_path="/v1"
    
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(os.getenv("CORS_ALLOW_ORIGINS")),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(processes_router)
app.include_router(companies_router)
app.include_router(questionnaires_router)


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}
