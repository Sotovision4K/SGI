from cachetools import TTLCache
import jwt
from jwt import PyJWKClient
from typing import Dict, Any


class CognitoAdapter:
    def __init__(
        self,
        jwks_url: str,
        audience: str,
        issuer: str,
        cache_ttl: int = 60,  # Default to 60 seconds instead of 5 minutes for token revocation capability
    ) -> None:
        self.jwks_url = jwks_url
        self.audience = audience
        self.issuer = issuer
        self.jwks_client = PyJWKClient(jwks_url, cache_keys=True)
        # Use the provided cache_ttl parameter instead of hardcoded 300
        self.payload_cache = TTLCache(maxsize=1000, ttl=cache_ttl)

    def verify_token(self, token: str) -> Dict[str, Any]:
        if token in self.payload_cache:
            return self.payload_cache[token]

        signing_key = self.jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=self.audience,
            issuer=self.issuer,
        )

        self.payload_cache[token] = payload
        return payload