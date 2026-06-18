#!/usr/bin/env bash
# Install (or uninstall) the git pre-commit hook for cert_app.
# Symlinks .git/hooks/pre-commit -> scripts/pre-commit.sh so updates to the
# shareable script take effect immediately on the next commit.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_PATH="$REPO_ROOT/.git/hooks/pre-commit"
SOURCE_PATH="$REPO_ROOT/scripts/pre-commit.sh"

if [ "${1:-}" = "--uninstall" ]; then
  if [ -L "$HOOK_PATH" ] && [ "$(readlink "$HOOK_PATH")" = "$SOURCE_PATH" ]; then
    rm "$HOOK_PATH"
    echo "Removed pre-commit hook."
  elif [ -f "$HOOK_PATH" ]; then
    rm "$HOOK_PATH"
    echo "Removed pre-commit hook (was a regular file, not a symlink)."
  else
    echo "No pre-commit hook installed."
  fi
  exit 0
fi

if [ ! -f "$SOURCE_PATH" ]; then
  echo "ERROR: $SOURCE_PATH not found." >&2
  exit 1
fi

if [ -e "$HOOK_PATH" ] && [ ! -L "$HOOK_PATH" ]; then
  echo "Backing up existing pre-commit hook to $HOOK_PATH.bak"
  mv "$HOOK_PATH" "$HOOK_PATH.bak"
fi

ln -sf "$SOURCE_PATH" "$HOOK_PATH"
chmod +x "$SOURCE_PATH"
echo "Installed pre-commit hook -> $SOURCE_PATH"
echo "Bypass with: git commit --no-verify"
