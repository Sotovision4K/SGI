# AGENTS.md

## Project Overview

SGI Pro is an automation certification tool for ISO management systems (ISO 9001, 14001, 45001). The repo has a frontend (React) and planned backend (FastAPI).

## Frontend Commands

```bash
cd frontend
pnpm dev          # Start dev server
pnpm build        # TypeScript check + Vite build (run lint first)
pnpm lint         # ESLint check
pnpm preview      # Preview production build
```

## Key Stack Details

- **Package manager**: pnpm (NOT npm/yarn). Required due to `.npmrc` with `shamefully-hoist=true` and `public-hoist-pattern` for react/radix
- **React Compiler**: Enabled via `babel-plugin-react-compiler` - impacts build performance
- **Zod v4**: Used for validation (not v3)
- **Auth**: AWS Cognito via `react-oidc-context` - config in `.env` with `VITE_*` prefix

## Design System

Colors (defined in `tailwind.config.js`):

- Primary: `#0A2540` (dark navy)
- Accent: `#0066CC` (blue)
- Accent-light: `#E8F1FB`
- Text-main: `#1A1F36`
- Text-muted: `#5A6478`
- Bg-soft: `#F7F9FC`
- Success: `#00875A`

## Architecture Notes

- Frontend entrypoint: `frontend/src/main.tsx` → `App.tsx`
- Routes use React Router v7
- Pages in `frontend/src/pages/`, components in `frontend/src/components/`
- Auth config at `frontend/src/lib/auth-config.tsx`

## Backend (Planned)

Backend uses FastAPI with the skill loaded from `agents/skills/fastapi/`. See `.opencode/docs/authentication.cognito.md` for the planned architecture and user table schema.

## OpenCode Config

Agent-specific instructions are in `.opencode/agents/` (frontend rules, mockup, styles). The `.opencode/agents/` directory also exists with additional frontend guidance.

## Existing Instruction Files

- `.opencode/docs/authentication.cognito.md` - Backend auth spec and user table schema
- `.opencode/agents/frontend/spec.md` - Frontend auth and registration requirements
- `.opencode/agents/frontend/rules/ayns-suspense-boundaries.md` - Strategic Suspense Boundaries pattern

## Ask

- see `.opencode/agents/clarify.md` if a question is ask
