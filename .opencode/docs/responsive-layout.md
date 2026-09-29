# Responsive Layout & Mobile Support

Summary of the work to make the authenticated app fit phone / tablet screens, add a
collapsible responsive sidebar, and let users view **both** the plan and the diagnosis
after a plan is generated.

## Scope

Everything rendered inside the authenticated `AppLayout` (`<main>`), i.e. all routes under
`/processes`, `/companies`, `/audits`, `/reports`, `/settings`, plus the shared UI in
`frontend/src/components/ui/*`.

Design tokens live in `frontend/tailwind.config.js` (`app.*` palette). Tailwind's default
breakpoints are used: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.

---

## 1. App shell — collapsible responsive sidebar

Files: `frontend/src/components/layout/AppLayout.tsx`, `Sidebar.tsx`

- **Desktop (≥ `lg`):** sidebar is a static column that collapses to an icon-only rail
  (`w-64` ↔ `w-16`) via a chevron toggle in the brand row. Labels hide; each nav item
  keeps a `title` tooltip. The logout button becomes icon-only.
- **Mobile (< `lg`):** sidebar becomes an off-canvas drawer (`fixed`, translated off-screen)
  opened by a hamburger in a mobile-only top bar, with a dark backdrop overlay. Tapping a
  nav item or the backdrop closes it. A `matchMedia('(min-width: 1024px)')` listener
  auto-closes the drawer on resize to desktop.
- Two `Sidebar` instances are rendered: desktop (`hidden lg:flex`, gets `collapsed` +
  `onToggleCollapse`) and mobile drawer (`fixed … lg:hidden`, gets `onNavigate` to close).

`Sidebar` props: `{ collapsed?, onNavigate?, onToggleCollapse?, className? }`.

---

## 2. Page-level responsive fixes

### Tables — horizontal scroll on narrow screens
- `frontend/src/components/ui/Table.tsx`: wrapper `overflow-y-auto` → `overflow-auto`
  (enables x-scroll).
- `frontend/src/pages/process/dashboard/ProcessTable.tsx`: `min-w-[760px]` on header +
  body rows (7 columns, fixed `w-52` actions column).
- `frontend/src/pages/app/CompaniesPage.tsx`: `min-w-[680px]` on header + body rows
  (6 columns).

### Kanban (plan) — horizontal scroll instead of stacking
- `frontend/src/pages/process/PlanResultView.tsx`: the 3-column grid became a horizontal
  scroller — `flex gap-6 overflow-x-auto` with each column wrapped in
  `min-w-[280px] max-w-[85vw] sm:max-w-none sm:flex-1 shrink-0`. Drag-and-drop unchanged.

### Dialog — never touches screen edges + X close button
- `frontend/src/components/ui/Dialog.tsx`:
  - `DialogContent` width: `w-[calc(100vw-2rem)] max-w-lg` (was `max-w-lg w-full`).
  - Added a shared top-right **X** close button (`DialogPrimitive.Close`) so every dialog
    (`TaskDetailDialog` in `PlanResultView`, `CompanyForm`, `ConfirmDialog`) has a
    close affordance.
  - `DialogHeader` got `pr-8` so a long title can't collide with the X.

### Filters
- `frontend/src/pages/process/dashboard/ProcessFilters.tsx`: `MultiSelect`s use
  `w-full sm:w-auto sm:min-w-[170px]` (full-width + wrap on phones).

### Stat cards — compact 2-up grid on phones
- `frontend/src/pages/process/dashboard/StatCards.tsx`:
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` → `grid-cols-2 lg:grid-cols-5`
  (5 cards → 3 compact rows on mobile).

### Process list — height lock scoped to desktop
- `frontend/src/pages/process/ProcessListPage.tsx`: the viewport-locked card
  (`h-full` + `flex-1`/`min-h-0`) was collapsing the table to 0 height on mobile (the
  stacked stat cards consumed the full fixed height). Scoped `h-full`, `flex-1`,
  `min-h-0`, `overflow-y-auto` to `xl:` so the page scrolls naturally on mobile while
  desktop keeps its internal-scroll layout.
- `ProcessTable.tsx` root + `<Table className>` also scoped `flex-1 min-h-0` → `xl:*`.

### Wizard — footer no longer clipped on mobile
- `frontend/src/pages/process/NewProcessWizardPage.tsx`: outer wrapper
  `h-screen` → `h-full`. `h-screen` (100vh) was 56px taller than `main` (which sits below
  the `h-14` mobile top bar), clipping the `Salir` footer and causing a double scroll.
  `h-full` resolves to `main`'s height at every breakpoint.

### Company form — buttons stack on mobile
- `frontend/src/components/companies/CompanyForm.tsx`: `PRIMARY_BTN`/`SECONDARY_BTN` got
  `w-full sm:w-auto`; both action rows became
  `flex flex-col sm:flex-row sm:items-center gap-3` (were `flex items-center gap-3`),
  fixing the ~370px overflow at 360px.

### Findings group headers wrap
- `frontend/src/pages/process/wizard/StepFindings.tsx`: group title + clauses row got
  `flex-wrap` (and `min-w-0 break-words` on the clause span) so long clause lists wrap
  instead of overflowing.

---

## 3. "Editar diagnóstico" — view both plan and diagnosis

Before: once a plan was generated, the `Diagnóstico` card's single button flipped to
"Ver plan", and re-opening the wizard redirected straight to the plan — losing access to
the diagnosis answers.

Now the user can see **both**:

- `frontend/src/pages/process/ProcessDetailPage.tsx` — when `hasPlan`, the `Diagnóstico`
  card shows two actions:
  - **"Ver plan"** → `/processes/:id/plan`
  - **"Editar diagnóstico"** → `/processes/new?processId=:id&edit=true`
  - When there's no plan yet, the single button ("Iniciar/Continuar diagnóstico") is
    unchanged.
- `frontend/src/pages/process/NewProcessWizardPage.tsx` — supports the new `edit` param:
  - `const editDiagnosis = searchParams.get('edit') === 'true'`
  - The plan-redirect effect now skips when `editDiagnosis` is set.
  - `landingStep` is forced to `2` (findings) when `editDiagnosis`.
  - The findings step opens pre-filled from `useFindings` answers and remains editable —
    "Generar Plan" regenerates if re-submitted; "Salir" exits without regenerating.

---

## Verification

- `pnpm lint` — clean.
- `pnpm build` (`tsc` + Vite) — clean.
- `pnpm test` — 107/108 pass.

The single failing test (`PlanPage.test.tsx:130`,
`getByText('Acme Inc · iso9001')`) is **pre-existing** and unrelated to this work: an
earlier commit split the plan subtitle into separate `<span>`s without updating the test.
It fails on `HEAD` before these changes too.

---

## Related commits

- `00a1cc4` — feat(layout): responsive app shell with collapsible sidebar
- `5379f56` — fix(layout): show process table on mobile and compact stat cards
- (subsequent) — responsive wizard/company-form/step-findings fixes, "Editar diagnóstico",
  and the shared dialog X close button.
