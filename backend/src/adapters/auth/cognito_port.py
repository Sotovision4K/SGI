from typing import Protocol, Dict, Any, runtime_checkable


@runtime_checkable
class CognitoPort(Protocol):
    def verify_token(self, token: str) -> Dict[str, Any]:
        ...