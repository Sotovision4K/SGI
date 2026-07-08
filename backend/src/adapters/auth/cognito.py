from cachetools import TTLCache
import jwt
from jwt import PyJWKClient
from typing import Any


class CognitoAdapter:
    def __init__(
        self,
        jwks_url: str,
        client_id: str,
        issuer: str,
        cache_ttl: int = 60,  # Default to 60 seconds instead of 5 minutes for token revocation capability
    ) -> None:
        self.jwks_url = jwks_url
        self.client_id = client_id
        self.issuer = issuer
        self.jwks_client = PyJWKClient(jwks_url, cache_keys=True)
        # Use the provided cache_ttl parameter instead of hardcoded 300
        self.payload_cache = TTLCache(maxsize=1000, ttl=cache_ttl)

    def verify_token(self, token: str) -> dict[str, Any]:
        if token in self.payload_cache:
            return self.payload_cache[token]

        # Wrap all token-level failures as InvalidTokenError so callers
        # (auth.py) always get a 401, never a 500 from JWKS/network errors.
        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self.issuer,
                # Cognito access tokens carry `client_id`, not `aud` (ID tokens
                # carry `aud`). We disable PyJWT's audience check and verify
                # `client_id` + `token_use` manually below, which also rejects
                # ID tokens (they lack `client_id`) and cross-client tokens.
                options={"verify_aud": False},
            )
        except jwt.InvalidTokenError:
            raise
        except Exception as e:
            raise jwt.InvalidTokenError("Token verification failed") from e

        if payload.get("token_use") != "access":
            raise jwt.InvalidTokenError("Only access tokens are accepted")

        if payload.get("client_id") != self.client_id:
            raise jwt.InvalidTokenError("Token belongs to a different app client")

        self.payload_cache[token] = payload
        return payload