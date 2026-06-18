import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from src.routes.user.auth import CurrentUserDep


router = APIRouter(prefix="/api/v1/questionnaires", tags=["questionnaires"])


_QUESTIONNAIRES_DIR = Path(__file__).parent.parent.parent.parent / "questionnaires"

_VALID_ISO = {"iso9001", "iso14001", "iso45001"}


@router.get("/{iso_standard}")
async def get_questionnaire(
    iso_standard: str,
    current_user: CurrentUserDep,
) -> dict:
    if iso_standard not in _VALID_ISO:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Norma ISO no soportada: {iso_standard}. Válidas: {sorted(_VALID_ISO)}",
        )

    file_path = _QUESTIONNAIRES_DIR / f"{iso_standard}.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cuestionario no encontrado: {file_path}",
        )

    with open(file_path, encoding="utf-8") as f:
        return json.load(f)
