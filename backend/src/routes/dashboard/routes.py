from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from src.routes.user.auth import CurrentUserDep


router = APIRouter(prefix="/api/v1", tags=["dashboard"])


class ProcessItem(BaseModel):
    id: str
    name: str
    status: str
    progress: int


class DashboardResponse(BaseModel):
    message: str
    processes: List[ProcessItem] = []
    total_processes: int = 0


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(current_user: CurrentUserDep) -> DashboardResponse:
    return DashboardResponse(
        message="Dashboard endpoint - process retrieval not implemented yet",
        processes=[],
        total_processes=0,
    )