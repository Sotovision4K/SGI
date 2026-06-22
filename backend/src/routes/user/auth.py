from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.adapters.auth.cognito import CognitoAdapter
from src.adapters.auth.cognito_port import CognitoPort
from src.config.settings import SettingsDep
from jwt import InvalidTokenError, ExpiredSignatureError, DecodeError, MissingRequiredClaimError

security = HTTPBearer()


def get_cognito_adapter(settings: SettingsDep) -> CognitoPort:
    """Create and return a CognitoAdapter instance with settings from config."""
    return CognitoAdapter(
        jwks_url=settings.aws_cognito_jwks_url,
        audience=settings.aws_cognito_client_id,
        issuer=f"https://cognito-idp.{settings.aws_cognito_region}.amazonaws.com/{settings.aws_cognito_user_pool_id}",
    )


CognitoAdapterDep = Annotated[CognitoPort, Depends(get_cognito_adapter)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    adapter: CognitoAdapterDep,
) -> dict:
    try:
        payload = adapter.verify_token(credentials.credentials)
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token ha expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except MissingRequiredClaimError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Claims de token inválidos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (InvalidTokenError, DecodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticación inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )


CurrentUserDep = Annotated[dict, Depends(get_current_user)]