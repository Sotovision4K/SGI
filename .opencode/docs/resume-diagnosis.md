# Resume pre-diagnosis / diagnosis (complete the diagnose)

## Status: planned (not implemented)

Backend: **no changes.** Assessment uses existing endpoints.

## Problem

A process is persisted server-side at wizard step 0 (`create_process`). If the user closes the
screen before submitting, there is no way to resume. The detail page ("Ver detalles") only links to
a stub `/diagnose` route, and the wizard can only start from step 0.

## Decided behavior

- Closing the **tab** loses unsubmitted progress (accepted boundary).
- Pressing **"Salir"** must persist the active step's progress.
- Autosave on **"Siguiente"/"Anterior"/"Revisar"** in pre-diagnosis (per-group transition writes) +
  **"Salir"** flush. No per-keystroke debounce.
- Header indicator (line only, no toasts): "Guardado automático activado · Último guardado: <time>".

## Assess state (server-only, existing endpoints)

- `GET /processes/{id}` → `pre_diagnosis` (non-empty = submitted) + `status` (`plan_ready` = plan exists)
- `GET /processes/{id}/findings` → `answers` (non-empty = diagnosis submitted)
- `GET /processes/{id}/plan` → plan exists

Frontend derives:
- `preDiagnosisDone` = `Object.keys(pre_diagnosis ?? {}).length > 0`
- `diagnosisDone` = `findings.answers` non-empty OR `status === 'plan_ready'`
- `hasPlan` = `status === 'plan_ready'`

## Resume entry points

- `ProcessDetailPage` deep-links to `/processes/new?processId=<id>` (state-aware CTA).
- `NewProcessWizardPage` reads `?processId=` via `useSearchParams`:
  - absent → normal flow (step 0)
  - present → resume mode: `useProcess(id)` (server) + `loadDraft(id)` (sessionStorage draft)
  - landing step = max(server, draft), clamped (never past a submitted stage; never step 3 without a plan)
- No new route. `ProcessDetailPage` keeps `useParams` for `/processes/:processId`.

## sessionStorage draft store

- Key: `sgipro:draft:<processId>`
- Value:
  ```ts
  {
    version: 1,
    processId: string,
    step: 1 | 2 | 3,            // wizard step
    subStep?: number,           // pre-diagnosis group index (0..groups.length)
    preDiagnosis?: Record<string,string>,  // partial step-1 answers
    findings?: Record<string,string>,      // partial step-2 answers
    updatedAt: string            // ISO timestamp → "Último guardado"
  }
  ```
- Functions: `loadDraft(processId)` / `saveDraft(processId, patch)` (merge + bump updatedAt) / `clearDraft(processId)`.
- Read-time validation: plain object; key regex `^[a-z][a-z0-9_]{0,99}$`; values ≤2000 (mirror backend `routes.py:163-164`).
- Empty/blank answers not stored. Writes guarded for `QuotaExceededError`.
- Precedence when seeding: server > draft > questionnaire defaults.

## Save triggers

| Trigger | Effect |
|---|---|
| Siguiente / Anterior / Revisar (pre-diagnosis) | `saveDraft` with current answers + subStep |
| Salir | flush active step (findings via `getDraftState()` handle) |
| Pre-diagnosis submit success | `clearDraft` |
| Plan-ready | `clearDraft` |
| Tab closed | browser wipes sessionStorage (accepted) |

## Files to change

| # | File | Status | Change |
|---|---|---|---|
| 1 | `frontend/src/lib/process-draft.ts` | NEW | sessionStorage draft store (schema, load/save/clear, validation) |
| 2 | `frontend/src/pages/process/NewProcessWizardPage.tsx` | MOD | resume mode via `?processId=`; landing step; autosave wiring; header "último guardado" line; Salir flush; clearDraft on submit/plan-ready |
| 3 | `frontend/src/pages/process/wizard/StepPreDiagnosis.tsx` | MOD | `initialValues`/`initialSubStep` props; `onProgressSave` on step transitions |
| 4 | `frontend/src/pages/process/wizard/StepFindings.tsx` | MOD | `initialValues` prop; `getDraftState()` imperative handle for Salir |
| 5 | `frontend/src/pages/process/ProcessDetailPage.tsx` | MOD | resume hub: `useFindings`, derive flags, state-aware CTA deep-link |
| 6 | `frontend/src/pages/process/wizard/StepPreDiagnosis.test.tsx` | MOD | cover new seeding + `onProgressSave` |
| 7 | `infra/modules/frontend/main.tf` | MOD | `aws_cloudfront_response_headers_policy` + wire into `default_cache_behavior` |
| 8 | `frontend/index.html` | MOD | remove `<meta http-equiv="Content-Security-Policy">` |

Backend untouched.

## CSP change (files 7-8)

- CSP moves to a CloudFront response headers policy (`custom_headers_config`); optional
  `security_headers_config` for nosniff / X-Frame-Options / HSTS.
- Makes `frame-ancestors` effective (ignored in `<meta>`); prod-only (decouples Vite dev).
- Requires `terraform apply`; CSP applied at edge per-response (not cache-coupled).
- Optional to split CSP into its own PR; core resume feature is files 1-6.

## Security notes

- SessionStorage (not localStorage): token (`react-oidc-context`) already lives in sessionStorage.
- XSS proof is about rendering, not storage: no `dangerouslySetInnerHTML`; validate drafts on read.
- CSP already present in production via meta tag (proxy layer); moving to header only strengthens.

## Verification

- `pnpm --dir frontend build` (typecheck) + `pnpm --dir frontend lint`
- `make test`
- Manual: create → close mid-pre-diagnosis → resume from detail → answers restored → submit → draft cleared → plan flow