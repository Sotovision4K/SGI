import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_SITE_PACKAGES = os.path.join(CURRENT_DIR, ".venv", "lib", "python3.12", "site-packages")
if os.path.isdir(VENV_SITE_PACKAGES):
    sys.path.insert(0, VENV_SITE_PACKAGES)

from mangum import Mangum
from src.main import app

handler = Mangum(app)
