from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.settings import get_settings
from src.routes.user.routes import router as users_router
from src.routes.dashboard.routes import router as dashboard_router
from src.adapters.db.user_repository import get_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    engine = get_engine(settings.database_url)
    async with engine.begin() as conn:
        from sqlmodel import text
        await conn.run_sync(text("SELECT 1"))
    yield


app = FastAPI(
    title="SGI Pro API",
    description="Backend API for SGI Pro - ISO Management System Certification Tool",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(dashboard_router)


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}