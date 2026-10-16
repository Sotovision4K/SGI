"""Pytest config — path setup for src import."""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT / "src"))

# Force-import the app before any test patches ``get_settings``. The FastAPI app is a
# module singleton; if the *first* import happens under ``patch("...get_settings")``
# (as some test files do), every route's ``Depends(get_settings)`` permanently captures
# the MagicMock and ``dependency_overrides`` keyed on the real function stop matching —
# producing the "query args/kwargs" 422. Importing here (unpatched) makes the real
# function the consistently captured callable across the whole session.
import src.main  # noqa: E402,F401  (side-effect: register app before patches)

