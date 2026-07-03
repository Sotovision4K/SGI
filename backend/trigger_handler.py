"""Lambda entrypoint for the Cognito Post-Confirmation trigger.

Separate from handler.py (the API Mangum entrypoint) so the trigger Lambda
can use a different handler while sharing the same deployment package.
"""

import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_SITE_PACKAGES = os.path.join(CURRENT_DIR, ".venv", "lib", "python3.12", "site-packages")
if os.path.isdir(VENV_SITE_PACKAGES):
    sys.path.insert(0, VENV_SITE_PACKAGES)

from src.trigger.post_signup_trigger import handler  # noqa: E402

# Lambda handler — the function name 'handler' is required by the Terraform
# aws_lambda_function resource (handler = "trigger_handler.handler").
__all__ = ["handler"]
