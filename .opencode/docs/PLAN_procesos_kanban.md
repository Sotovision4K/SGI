# Plan: Mejoras en Procesos + Tablero Kanban del Plan

> Estado: **aprobado, pendiente de implementación** (no empezar a codificar).
> Alcance: ruta `/processes` (frontend) y plan de acción (backend + frontend).

## Decisiones cerradas

| Tema | Decisión |
| --- | --- |
| Columnas del tablero | 3: **Pendiente / Iniciada / Completada** |
| Cambio de estado | Drag & drop **HTML5 nativo** + botón "completar" en tarjeta + modal (sin dependencias nuevas) |
| Campos de tarjeta | `owner_role` (responsable) + nuevo `department` (departamento) |
| Comentarios por tarea | Sí (nueva tabla + endpoints) |
| Departamento | Vacío por defecto, editable solo en el modal. Si está vacío → tag **"Por definir"**. **No** se toca la generación LLM |

---

## 1) Scroll independiente + títulos sticky

**Objetivo UX:** ver el fondo de la tabla, scroll solo en la tabla, encabezados siempre visibles; lo mismo en el panel derecho.

**Archivos:** `frontend/src/components/ui/Table.tsx`, `frontend/src/pages/process/dashboard/ProcessTable.tsx`, `frontend/src/pages/process/ProcessListPage.tsx`

- `Table.tsx`: contenedor con `max-h` + `overflow-y-auto`; `TableHeader` como `sticky top-0 z-10 bg-white` (con borde inferior). Solo el cuerpo scrollea.
- `ProcessTable.tsx`: altura controlada (`max-h-[calc(...)]`) para que el fondo de la tabla sea visible.
- `ProcessListPage.tsx`: panel derecho (`ActivityWidget` + `CompaniesWidget`) con su propio scroll (`max-h` + `overflow-y-auto`).

---

## 2) Ver plan + flag "Plan listo"

**Archivos:** `frontend/src/pages/process/dashboard/ProcessTable.tsx`, `ProcessFilters.tsx`, `ActivityWidget.tsx`, `ProcessDetailPage.tsx`

- Botón "Ver plan" (icono) cuando `process.status === 'plan_ready'` → navega a `/processes/:id/plan`.
- Badge `plan_ready`: "En revisión" → **"Plan listo"** (con distintivo visual).
- Actualizar etiquetas en filtros (`ProcessFilters`) y widget de actividad (`ActivityWidget`).

> Nota: el backend ya transiciona `in_diagnosis → plan_ready` al generar el plan (`plan_generation.py:288`). "En diagnóstico" cambia a "Plan listo" vía `status=plan_ready`.

---

## 3) StatCards + ciclo de vida del estado

**Causa raíz del "conteo no cambia":** `update_pre_diagnosis` no cambia `status`, por lo que "En progreso" nunca sube; y `savePreDiagnosis` no invalida queries.

**Archivos:** `frontend/src/pages/process/dashboard/StatCards.tsx`, `frontend/tailwind.config.js`, `backend/src/adapters/db/process_repository.py`, `backend/src/routes/processes/routes.py`, `frontend/src/pages/process/wizard/StepPreDiagnosis.tsx`

- **Backend:** en `update_pre_diagnosis`, si `status == in_diagnosis` → `in_progress` (en la misma transacción).
- **Frontend:** tras `savePreDiagnosis` exitoso, invalidar `['processes']` y `['process', id]`.
- **`StatCards.tsx`:** 5 tarjetas
  - Total procesos → todos
  - En progreso → `status === 'in_progress'`
  - Completados → `status === 'completed'`
  - Pendiente revisión → `status === 'in_diagnosis'` (nada hecho)
  - **Planes generados** (nuevo) → `status === 'plan_ready'`
  - Añadir color `bg-stat-plan` en `tailwind.config.js`.

**Mapeo de etiquetas (aplicado):**

| status | Badge |
| --- | --- |
| `in_diagnosis` | "Pendiente revisión" |
| `in_progress` | "En progreso" |
| `plan_ready` | "Plan listo" |
| `completed` | "Completado" |

---

## 4) Tablero Kanban del plan

### 4a) Backend — modelo de datos

**Archivos:** `backend/src/domain/entities/plan.py`, `backend/src/adapters/db/process_repository.py`, `backend/src/routes/processes/routes.py`, `backend/alembic/versions/002_task_workflow.py`

- Nuevo enum `TaskStatus`: `PENDING = "pending"`, `STARTED = "started"`, `COMPLETED = "completed"` (valores en inglés en DB; etiquetas ES en frontend).
- Añadir a `Task` (entidad) y `TaskTable`:
  - `department: str = ""` (máx 100)
  - `status: TaskStatus = PENDING`
- Nueva tabla `task_comments`: `id`, `task_id` (FK), `author_id`, `body`, `created_at`.
- Migración `002_task_workflow.py`: `ALTER TABLE tasks ADD COLUMN department / status` (con defaults) + `CREATE TABLE task_comments`.
- **No** se modifica el LLM (department queda vacío).

### 4b) Backend — endpoints

- `TaskSchema` / `UpdateTaskRequest`: añadir `department` y `status`.
- `PUT /processes/{id}/plan/tasks/{task_id}`: `patch_task` soporta `status`/`department` (mover de columna / marcar completado).
- Comentarios:
  - `GET /processes/{id}/plan/tasks/{task_id}/comments`
  - `POST /processes/{id}/plan/tasks/{task_id}/comments` (body `{ body }`)
- Incluir `status`/`department` en la respuesta de `get_plan`.

### 4c) Frontend — API / hooks

**Archivos:** `frontend/src/api/plan.ts`, `frontend/src/hooks/usePlan.ts`

- `PlanTask`: añadir `department`, `status`.
- `UpdateTaskInput`: añadir `department`, `status`.
- Tipos y funciones: `TaskComment`, `getTaskComments`, `addTaskComment`.
- Hooks: `useUpdateTask` (reutilizable para mover/marcar), `useTaskComments`, `useAddTaskComment`.

### 4d) Frontend — UI Kanban

**Archivos:** `frontend/src/pages/process/PlanResultView.tsx` (reescritura), `frontend/src/pages/process/PlanPage.tsx`

- Reescribir `PlanResultView` como tablero de **3 columnas** (Pendiente / Iniciada / Completada).
- **Tarjeta** (máx. info sin abrumar): título, descripción truncada, responsable (`owner_role`), departamento (`department`, o tag "Por definir"), severidad (`priority`), esfuerzo (`estimated_effort`).
  - Botón "completar" (check) en la tarjeta.
  - Arrastrar entre columnas (HTML5 nativo) para cambiar estado.
- **Modal** (Radix `Dialog`): título, descripción, prioridad, esfuerzo, rol responsable, departamento (editable; "Por definir" si vacío), `require_document`/`document_title`, selector de estado, y **comentarios** (listar + añadir). Reutilizar/ampliar `TaskEditForm`.
- `PlanPage.tsx`: quitar `readOnly` (el tablero es interactivo).

---

## Verificación

- Backend: `cd backend && pytest` (o `make test`).
- Frontend: `cd frontend && pnpm lint && pnpm build && pnpm test`.
  - Actualizar tests afectados: `ProcessTable.test.tsx`, `PlanResultView.test.tsx`, `PlanPage.test.tsx`, `usePlan.test.tsx`.
- `make lint` / `make test` en la raíz.
- Prueba manual: crear proceso → pre-diagnóstico (ver "En progreso") → generar plan (ver "Plan listo" + tarjeta "Planes generados") → abrir tablero, mover/completar tareas y comentar.
