# CHANGES

## 2026-07-31 — ProcessListPage UI enrichment

**Files:** `frontend/src/pages/process/ProcessListPage.tsx`, `frontend/src/pages/process/dashboard/ProcessFilters.tsx`

- **Intention:** Give the process list page a card-shaped container (white surface + shadow) that clearly contrasts with the app page background, and reshape the search control into a compact pill so the filter bar reads as a discrete control cluster instead of a stretched full-width input.
- **Concerns:** responsiveness (card scales on small screens, search caps at `sm:w-72` and wraps), a11y (search keeps `aria-label`, clear button unchanged), no business-logic changes, no new dependencies.

### Details
- Wrapped page content in an outer padded wrapper (`p-4 lg:p-6`) plus an inner card (`bg-white rounded-2xl border border-app-border shadow-md p-6 lg:p-8`) so the card stands out against `bg-app-bg`.
- Replaced `flex-1 min-w-[200px]` search with `w-full sm:w-72` and added `rounded-full` (pill) via `twMerge` override on the shared `Input`; shifted the search icon slightly for pill alignment.

## 2026-08-01 — Wizard setup visual refactorization (Option 1: config + profile flow)

**Files:** `frontend/src/pages/process/NewProcessWizardPage.tsx`, `frontend/src/pages/process/wizard/WizardStepper.tsx`, `frontend/src/pages/process/wizard/StepSetup.tsx`, `frontend/src/pages/process/wizard/StepPreDiagnosis.tsx`, `frontend/src/api/questionnaire.ts`, `backend/questionnaires/pre_diagnosis.json`, `frontend/src/pages/process/wizard/StepPreDiagnosis.test.tsx`

- **Intention:** Reduce auditor cognitive load by chunking the setup into two distinct views — a 2-column configuration card grid (Empresa / Norma ISO) and a guided pre-diagnosis profile form with smart defaults, explicit step context, and consistent cards/buttons/fields per the app design system. Keep sidebar + app tokens (doc's "teal" maps to `app-accent`); buttons remain disabled-until-valid.
- **Concerns:** responsiveness (grids collapse to 1 column), a11y (`aria-current="step"`, `sr-only` radios with labeled cards, `aria-hidden` decorative icons), data-driven defaults must not clobber user input (ref-guarded reset), no new dependencies, existing test class contracts preserved.

### Details
- `StepSetup` → two cards: Empresa (dropdown + ghost "+ Crear nueva empresa") and Norma ISO (radio-styled cards with per-standard icons, ISO 9001 preselected).
- `StepPreDiagnosis` → applies `q.default` from the questionnaire once loaded; renders fields in a 2-column grid (textarea/cards/chips full width); shows `q.hint` helper text; step header badge "Paso X de Y".
- `WizardStepper` → added `aria-current="step"`, active ring, larger circles; kept test-critical `bg-app-primary`/`bg-success` classes.
- `NewProcessWizardPage` → hero header with step context chip, card shell (`rounded-2xl shadow-md`), danger-outline Salir, bottom-center success toasts on process creation / plan ready.
- Fixed pre-existing `tsc` errors in scope: removed dead `setSuggested(true)` call; replaced unused `@ts-expect-error` directive in the pre-diagnosis test.

