from typing import Annotated

from pydantic import ConfigDict
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")

    aws_cognito_user_pool_id: str
    aws_cognito_client_id: str
    aws_cognito_region: str
    aws_cognito_jwks_url: str

    database_url: str
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"


@lru_cache
def get_settings() -> Settings:
    return Settings()


SettingsDep = Annotated[Settings, None]