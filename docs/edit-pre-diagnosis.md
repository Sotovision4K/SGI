# Edit Pre-Diagnosis

## Summary

Added the ability to edit a process's **pre-diagnosis** from the process detail page.
Previously only the diagnosis (wizard step 2) was editable via `?edit=true`; the
pre-diagnosis (wizard step 1) had no entry point even though the backend already
supported updating it.

## Problem

`ProcessDetailPage` exposed an "Editar diagnóstico" link that navigated to
`/processes/new?processId=<id>&edit=true`, which forced the wizard to land on step 2
(Diagnóstico ISO). There was no equivalent for step 1 (Pre-diagnóstico), so once a
pre-diagnosis was saved it could not be revised from the UI.

## Solution

Introduced a second edit mode on the wizard distinguished by the `edit` query
parameter, plus a matching link on the detail page.

### Query parameter contract

| `edit` value      | Wizard landing step | Purpose                          |
| ----------------- | ------------------- | -------------------------------- |
| `true` / `diagnosis` | 2 (Diagnóstico ISO) | Edit the diagnosis (existing)    |
| `prediagnosis`    | 1 (Pre-diagnóstico) | Edit the pre-diagnosis (new)     |
| *(absent)*        | resume logic        | Create or continue a process     |

### Behavior

- Editing pre-diagnosis lands on the **editable first group** (not the read-only
  review sub-step), seeded with the previously saved answers.
- The `hasPlan → /plan` redirect is suppressed while editing pre-diagnosis, so a
  process with an existing plan can still have its pre-diagnosis revised.
- After saving, the user returns to the process detail page instead of being advanced
  to step 2.

## Files changed

### `frontend/src/pages/process/NewProcessWizardPage.tsx`

- Split the `edit` param into two booleans:
  - `editDiagnosis = edit === 'true' || edit === 'diagnosis'`
  - `editPreDiagnosis = edit === 'prediagnosis'`
- `landingStep`: land on step `1` when `editPreDiagnosis`.
- Redirect effect: also skipped when `editPreDiagnosis`.
- `handlePreDiagnosisDone`: navigate back to `/processes/<id>` in edit mode instead
  of advancing to step 2.
- `<StepPreDiagnosis startAtReview={preDiagnosisDone && !editPreDiagnosis} />` so an
  edit starts on the first editable group.

### `frontend/src/pages/process/ProcessDetailPage.tsx`

- Wrapped the "Diagnóstico" card actions in a `flex flex-col gap-2` container and
  added a secondary "Editar pre-diagnóstico" link (shown when `preDiagnosisDone`)
  pointing to `/processes/new?processId=<id>&edit=prediagnosis`.

## Backend

No changes required. Pre-diagnosis persistence already exists:

- `PUT /processes/{process_id}/pre-diagnosis` (`backend/src/routes/processes/routes.py`)
- `savePreDiagnosis(processId, answers, { token })` (`frontend/src/api/process.ts`)
- Existing values are seeded via `initialPreDiagnosis` in `NewProcessWizardPage`.

## Verification

Run from `frontend/`:

```bash
pnpm lint    # pass
pnpm test    # StepPreDiagnosis.test.tsx passes (12/12)
pnpm build   # tsc + vite build pass
```

> Note: `PlanPage.test.tsx` has one pre-existing failure unrelated to this change —
> the test expects the combined text `"Acme Inc · iso9001"` while `PlanPage.tsx`
> renders those as separate `<span>` elements. This failure predates this feature.
