# cert_app Makefile
# Common dev workflows.

SHELL := /bin/bash

.PHONY: help install-hooks uninstall-hooks lint test build clean

help:  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install-hooks:  ## Install the git pre-commit hook
	@bash scripts/install-hooks.sh

uninstall-hooks:  ## Remove the git pre-commit hook
	@bash scripts/install-hooks.sh --uninstall

lint:  ## Run all linters (frontend + backend)
	@cd frontend && pnpm lint
	@cd backend && uv run ruff check .

test:  ## Run all tests (frontend typecheck/build + backend pytest)
	@cd frontend && pnpm build
	@cd backend && uv run pytest

build:  ## Build frontend (full)
	@cd frontend && pnpm build

clean:  ## Remove build artifacts
	@rm -rf frontend/dist backend/.pytest_cache backend/.ruff_cache backend/**/__pycache__
