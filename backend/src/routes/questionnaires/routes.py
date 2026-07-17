import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from src.routes.user.auth import CurrentUserDep


router = APIRouter(prefix="/questionnaires", tags=["questionnaires"])


_QUESTIONNAIRES_DIR = Path(__file__).parent.parent.parent.parent / "questionnaires"

_VALID_QUESTIONNAIRES = {"iso9001", "iso14001", "iso45001", "pre_diagnosis"}


@router.get("/{iso_standard}")
async def get_questionnaire(
    iso_standard: str,
    current_user: CurrentUserDep,
) -> dict:
    if iso_standard not in _VALID_QUESTIONNAIRES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Norma ISO no soportada: {iso_standard}. Válidas: {sorted(_VALID_QUESTIONNAIRES)}",
        )

    file_path = _QUESTIONNAIRES_DIR / f"{iso_standard}.json"
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cuestionario no encontrado: {file_path}",
        )

    with open(file_path, encoding="utf-8") as f:
        return json.load(f)
