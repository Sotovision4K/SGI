"""Lambda entrypoint for the Cognito Post-Confirmation trigger."""
from src.trigger.post_signup_trigger import handler  # noqa: F401

__all__ = ["handler"]
