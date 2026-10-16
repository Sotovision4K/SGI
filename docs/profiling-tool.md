# Profiling Tool (Perfilamiento Adaptativo)

## Summary

Build an adaptive profiling tool for consultants to qualify prospects and generate
an estimate (cost, time, action plan) plus a pain-point analysis. The consultant
picks the prospect's primary need, the form adapts to show only the relevant
questions, and an LLM reasons over the structured answers + the consultant's free-text
notes to produce the recommendation.

This is a **new standalone tool** (not part of the certification wizard). The source
spec is `formularios_perfilamiento (1).json`; a backend-format transformation already
exists at `formularios_perfilamiento.backend-format.json` (68 questions / 8 groups).

## Scope decisions (agreed)

| Decision | Value |
| -------- | ----- |
| Delivery order | **Frontend first**, backend later |
| Module rename | "Calidad y mejora continua" → **"Optimización de Procesos"** |
| Display model | Base questions (always) + only the **selected** module (adaptive) |
| Outputs | Pain points (LLM), cost estimate, time estimate, action plan |
| Pain points input | Free text entered by the auditor, reasoned over by the LLM |
| Integration | Standalone page under `AppLayout`, new sidebar entry |

---

## User flow

```
1. Consultant opens "Perfilamiento" from the sidebar
2. Fills base questions (company identity, maturity, motivation, timeline)
3. Selects the primary need (selector base_08):
     ┌─ Optimización de Procesos
     ├─ Seguridad y Salud en el Trabajo
     ├─ Normas Técnicas Sectoriales
     ├─ Sostenibilidad y Ambiental
     └─ Planificación Estratégica
4. Form adapts: base questions + the 12 questions of the selected module
5. Consultant enters free-text pain points ("Observaciones / puntos críticos")
6. Clicks "Generar análisis"
7. Results panel shows: pain-point analysis, cost estimate, time estimate, action plan
```

---

## Module rename mapping

The `calidad` module (from `FORM-CAL`) is renamed. Everything that referenced
"Calidad y mejora continua" must change:

| Artifact | Before | After |
| -------- | ------ | ----- |
| Selector option (`base_08.options[0]`) | "Calidad y mejora continua" | "Optimización de Procesos" |
| `redirigir_formulario` key | "Calidad y mejora continua" | "Optimización de Procesos" |
| Module questions `mostrar_si.igual_a` | "Calidad y mejora continua" | "Optimización de Procesos" |
| Group `id` | `calidad` | `optimizacion` |
| Group `title` | "Módulo: Calidad y mejora continua" | "Módulo: Optimización de Procesos" |
| Question `id` prefix | `cal_` | `opt_` (optional, see open questions) |

> NOTE: This rename is data-level (questionnaire JSON) but must also be reflected in
> the frontend module-key mapping (see Phase 2).

---

## Implementation phases

### Phase 0 — Data preparation (foundation, no UI)

Prepare the questionnaire JSON that the frontend will consume.

**Files**: `formularios_perfilamiento.backend-format.json` (or `backend/questionnaires/profiling.json`)

**Tasks**:
- [ ] Apply the module rename (`calidad` → `optimizacion` / "Optimización de Procesos").
- [ ] Ensure the selector `base_08` options and `redirigir_formulario` are consistent
      after the rename.
- [ ] Add a pain-points question (free-text) — either as a new question in the
      questionnaire or handled as a dedicated form field (decision in Phase 2).
- [ ] Confirm question `type` coverage is `text | select | chips` only (all renderable
      by the existing question renderer).

**Exit criteria**: JSON valid, 8 groups, 68 questions, rename applied, no orphaned
`mostrar_si` references.

> **Depends on**: none.

---

### Phase 1 — Frontend: API & types layer

Add the profiling questionnaire to the frontend data layer.

**Files**:
- `frontend/src/api/questionnaire.ts`
- `frontend/src/hooks/useQuestionnaire.ts` (or a new `useProfiling.ts`)

**Tasks**:
- [ ] Add `'profiling'` to `QuestionnaireKey`.
- [ ] Decide whether to extend the existing `Question` interface with profiling
      metadata (`alimenta`, `show_if`/`mostrar_si`, `redirigir_formulario`) or define
      a dedicated `ProfilingQuestion`/`ProfilingGroup` type. Recommendation: a
      dedicated `profiling.ts` API module to avoid polluting the ISO questionnaire types.
- [ ] Add a `useProfiling` hook (React Query) that fetches `/questionnaires/profiling`.

**Exit criteria**: `getQuestionnaire('profiling')` type-checks and returns the data.

> **Depends on**: Phase 0 (data available). Can be prototyped against a local mock/JSON
> import before the backend endpoint exists.

---

### Phase 2 — Frontend: adaptive form component

The core UI: base questions + selector + conditional module.

**Files** (new, under `frontend/src/pages/profiling/`):
- `ProfilingPage.tsx` — page wrapper (header, progress, actions)
- `ProfilingForm.tsx` — adaptive form
- `module-map.ts` — mapping from selector label → module key → question ids
- `pain-points.tsx` (or inline) — free-text pain points input

**Tasks**:
- [ ] Define `ModuleKey = 'optimizacion' | 'sst' | 'nts' | 'sos' | 'planificacion'`.
- [ ] Map `base_08` selected label → `ModuleKey` (using the post-rename labels).
- [ ] Render **always-visible** groups: `perfil`, `contexto`, `selector`.
- [ ] Render **one module group** based on `base_08` selection (hide others).
- [ ] Preserve answers when switching modules (don't clear hidden answers).
- [ ] Reuse the existing question renderer (supports `text`, `select`, `chips`).
- [ ] Render `hint` (used by the numeric `base_03`/`base_04` → `text` with hint).
- [ ] Add the pain-points free-text input (auditor notes).
- [ ] Draft persistence to `localStorage` (mirror `lib/process-draft.ts` pattern).

**Exit criteria**: Changing `base_08` swaps the visible module and retains base answers;
required-field validation blocks "next" until complete.

> **Depends on**: Phase 1.

---

### Phase 3 — Frontend: results view

Display the four outputs returned by the (future) analysis endpoint.

**Files**:
- `ProfilingResults.tsx`
- `frontend/src/components/ui/MarkdownRenderer.tsx` (if LLM returns markdown)

**Tasks**:
- [ ] Build result panel sections: **Pain points**, **Cost estimate**, **Time estimate**,
      **Action plan**.
- [ ] Render LLM markdown (pain-points analysis) via a lightweight markdown renderer
      (no heavy dep — see open questions).
- [ ] Define the client-side result type (`ProfilingResult`) matching the planned
      backend response.
- [ ] Handle loading / error / empty states for "Generar análisis".

**Exit criteria**: Given a mock `ProfilingResult`, all four sections render correctly.

> **Depends on**: Phase 2 (needs answers to display results for). Can be built in
> parallel with Phase 2 using a mock result.

---

### Phase 4 — Frontend: routing & navigation

Wire the page into the app shell.

**Files**:
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/App.tsx`

**Tasks**:
- [ ] Add sidebar nav item "Perfilamiento" (icon TBD — see open questions).
- [ ] Add lazy-loaded protected route `/profiling`.
- [ ] Mobile: confirm the nav item appears in the collapsible sidebar.

**Exit criteria**: `/profiling` is reachable from the sidebar, behind auth.

> **Depends on**: Phase 2 (page must exist).

---

### Phase 5 — Backend: serve the questionnaire

Expose the profiling questionnaire JSON via the existing route.

**Files**:
- `backend/questionnaires/profiling.json`
- `backend/src/routes/questionnaires/routes.py`

**Tasks**:
- [ ] Commit the Phase 0 JSON as `backend/questionnaires/profiling.json`.
- [ ] Add `'profiling'` to `_VALID_QUESTIONNAIRES`.
- [ ] Verify `GET /questionnaires/profiling` returns 200 with 8 groups.

**Exit criteria**: Frontend Phase 1 hook can fetch from the real endpoint.

> **Depends on**: Phase 0. (Frontend Phases 1–4 can proceed against mock data first.)

---

### Phase 6 — Backend: analysis endpoint + LLM

Generate pain-points analysis, cost, time, and action plan.

**Files**:
- `backend/src/routes/profiling/routes.py` — `POST /profiling/analyze`
- `backend/src/services/profiling_analyzer.py` — prompt builder + response parsing
- `backend/src/services/prompt_builder.py` (extend) — profiling prompt template
- `backend/tests/integration/test_profiling.py`

**Tasks**:
- [ ] Request schema: `answers` + `pain_points` (free text) + selected module.
- [ ] Use `alimenta` metadata to segment inputs for the LLM prompt:
      - `perfil` → company profile
      - `recomendacion` → recommendation drivers
      - `cotizacion` → cost drivers
      - `tiempo` → time drivers
- [ ] Prompt: instruct the LLM to reason over the auditor's `pain_points` and produce
      the "most important pain points".
- [ ] Response schema (Pydantic): pain-points analysis (markdown), cost estimate
      (range + breakdown + confidence), time estimate (months + phases + confidence),
      action plan (phases + milestones).
- [ ] Decide rule-based vs LLM for cost/time. The `alimenta` tags + the SST
      `reglas_motor_sst` pattern suggest rule-based scoring is possible; the LLM can
      fill the narrative.

**Exit criteria**: `POST /profiling/analyze` returns a validated, well-formed result.

> **Depends on**: Phase 5 (endpoint + questionnaire with `alimenta` metadata).

---

### Phase 7 — Integration & E2E

Connect frontend to backend and verify the full loop.

**Files**: wire `ProfilingForm` → `POST /profiling/analyze` → `ProfilingResults`.

**Tasks**:
- [ ] Replace mock `ProfilingResult` with real API call.
- [ ] Add frontend tests (adaptive display, module switch preserves answers).
- [ ] Add backend integration tests (analyze endpoint).
- [ ] `pnpm lint` + `pnpm test` + `pnpm build`; `make lint` + `make test`.

**Exit criteria**: End-to-end: select module → answer → generate → results render.

> **Depends on**: Phases 1–6.

---

## Dependency graph

```
Phase 0 (data) ──► Phase 1 (types) ──► Phase 2 (form) ──► Phase 4 (routing)
                         │                  │
                         │                  └──► Phase 3 (results, parallel)
                         │
                         └──► Phase 5 (backend serve) ──► Phase 6 (backend analyze)
                                                                      │
Phase 2 + Phase 6 ──► Phase 7 (integration & E2E)
```

Frontend Phases 1–4 can proceed **before** any backend work by consuming the
transformed JSON as a mock import.

---

## Open questions (blockers to resolve before/at each phase)

1. **Pain points input** — single free-text field, or structured per-module? (affects
   Phase 2 + Phase 6 prompt).
2. **Question id rename** — rename `cal_01..cal_12` → `opt_01..opt_12` alongside the
   module rename, or keep `cal_*` ids and only change labels? (affects Phase 0).
3. **Markdown rendering** — use an existing dependency or a minimal custom renderer?
   (affects Phase 3).
4. **Cost/time** — rule-based (like `reglas_motor_sst`) vs LLM-estimated vs hybrid?
   (affects Phase 6).
5. **Results persistence** — save analysis to a "prospect" DB entity, or ephemeral
   re-run? (affects Phase 6/7).
6. **Sidebar icon & label** — "Perfilamiento" with which icon? (affects Phase 4).
7. **Auth role** — consultants only, or any authenticated user? (affects Phase 4/6).

---

## Verification checklist (when implementation begins)

```bash
cd frontend && pnpm lint && pnpm test && pnpm build
cd backend && make lint && make test
```
