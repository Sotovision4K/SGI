import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_SITE_PACKAGES = os.path.join(CURRENT_DIR, ".venv", "lib", "python3.12", "site-packages")
if os.path.isdir(VENV_SITE_PACKAGES):
    sys.path.insert(0, VENV_SITE_PACKAGES)

from mangum import Mangum  # noqa: E402
from src.main import app  # noqa: E402


class PatchedMangum(Mangum):
    """Fix Mangum passing null body to FastAPI when API Gateway sends
    body=null for GET/HEAD requests. FastAPI's body parser chokes on
    None and returns 422 "body required" on endpoints that don't expect
    a body (reproduced by any Authorization: Bearer header)."""

    def __call__(self, event, context):
        # API Gateway Lambda proxy: body is null (JSON null → Python None)
        # for requests without a body. Mangum passes this through as-is,
        # and FastAPI's body validation fails. Default to empty string.
        if event.get("body") is None:
            event["body"] = ""
        return super().__call__(event, context)


handler = PatchedMangum(app, lifespan="off")
