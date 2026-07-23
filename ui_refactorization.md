# SGI Pro – UX Recommendations & Design System

## Decisions (2026-07-22)

- **Palette**: new colors apply only to authenticated app pages (`app.*` Tailwind tokens). Landing page retains original tokens (`primary`, `accent`, etc.).
- **Styling**: Tailwind + shadcn-style components only (no BEM/SCSS). The BEM CSS Architecture section has been removed.
- **Wizard**: keep current 4 top-level steps (Configuración → Pre-diagnóstico → Diagnóstico → Plan). Enhancements live inside each step.
- **AI Suggest**: client-side static suggestion map per ISO standard (no backend AI endpoint needed yet).

---

## 1. UX Recommendations

### Dashboard (Process Overview)

- **Visibility & Metrics:** Display all processes, not a simple "empty" message. Show KPIs (Total, In Progress, Completed, Pending Review) to give the auditor instant situational awareness.
- **Process Table:** Include columns for ID, Company, Standard (ISO), Stage, Status (color-coded), and Start Date. Provide quick inline actions (Edit, View, Delete).
- **Filters & Search:** Add dropdown filters for ISO standard and status, plus a global search bar to locate processes by company or ID.
- **Contextual Widgets:** Add a "Recent Activity" feed and a "Linked Companies" list so the auditor understands ongoing work without navigating away.
- **Sidebar Navigation:** Provide clear shortcuts to Companies, Audits, Reports, and Settings.

### Empty State (No Processes)

- **Educational & Action-Oriented:** Instead of a plain "No hay procesos," transform the table area into a welcoming centerpiece with:
  - A large illustration/icon.
  - A clear headline ("No certification processes yet").
  - A short explanation of the 4-step wizard (Setup → Pre-diagnosis → Full Diagnosis → Plan).
  - A prominent "Create Process" CTA.
- **Zero-State Widgets:** Stats should display `0` but remain visually consistent. Widgets should invite the first logical action (e.g., "Create your first company" with a small inline button).

### Pre-diagnosis Wizard (Micro-steps)

- **Progressive Disclosure:** Split the form into 4 compact steps (Company Data, Maturity Assessment, Strategic Objectives, Summary) with a visible progress bar.
- **Visual Inputs:** Replace plain textareas with chips (clickable tags) for objectives and cards for maturity level (Basic/Intermediate/Advanced). This reduces cognitive load.
- **AI Assistance:** Include a "Suggest with AI" button that auto-populates objectives based on the selected standard, reducing manual typing.
- **Instant Feedback:** Show a completion bar with encouraging messages ("Great progress!") and a final review screen where the auditor can see all data before submission.
- **Inline Creation:** Allow creating a new company directly inside the wizard (expandable form) rather than forcing a page navigation.

### Architecture & Transitions (Full-Route Approach)

- On each step of the pre diagnose process there should be a slide/transition effect.
- **State Management (Companies):** Leverage **React Query** (or SWR) to fetch and cache companies on the Dashboard. When the wizard mounts, the data is instantly available from cache, then revalidated in the background. This eliminates loading spinners and makes the experience feel blazing fast.

---

## 2. Design System (Colors)

### Color Palette (App Pages — `app.*` Tailwind tokens)

- **Primary (Dark Navy):** `#0B2A4A` – used for sidebar background, primary buttons, headings, and active states.
- **Accent (Sky Blue):** `#4FC3F7` – used for icons, interactive accents, progress bar gradients, and hover states.
- **Background:** `#F4F7FA` (page background), `#FFFFFF` (cards, tables, modals).
- **Text:** `#1E2A3A` (primary), `#7A8A9A` (secondary/labels), `#B0C4DE` (sidebar inactive links).
- **Status Colors:**
  - In Progress: `#E3F0FF` / `#1A6BB0`
  - Completed: `#E0F7E9` / `#1A8A4A`
  - Pending: `#FFF3E0` / `#B06A1A`
  - Review: `#FCE4EC` / `#B01A3A`
- **Borders & Dividers:** `#E8EDF4` (light gray).

---

## 3. Implementation with shadcn/ui (React/Tailwind)

### Tailwind classes to use

- **Container:** `<div className="bg-app-bg min-h-screen">` (using `app.*` Tailwind tokens).
- **Cards:** `<Card className="p-6 border border-app-border shadow-sm">`.
- **Badges:** `<Badge variant="outline" className="bg-status-in-progress-bg text-status-in-progress-text">` (status variants from Tailwind config).
- **Buttons:** `<Button className="bg-app-primary hover:bg-app-primary/90 text-white rounded-full px-6">`.
- **Table:** `<Table>` from shadcn/ui.
- **Chips (Objectives):** `<Badge variant="secondary" className="cursor-pointer" />` with selected/deselected toggle state.
- **Progress:** `<Progress value={progress} className="h-2 bg-app-border [&>div]:bg-gradient-to-r [&>div]:from-app-accent [&>div]:to-app-primary" />`.

### Key shadcn/ui Components to Use

1. **Navigation:** `Sidebar` (build custom with Lucide icons).
2. **Form:** `Input`, `Select`, `Textarea`, `Checkbox`.
3. **Data Display:** `Table`, `Badge`, `Card`, `Progress`.
4. **Feedback:** `Toast` or use `react-router-dom` for full routes.
5. **State:** `@tanstack/react-query` for data fetching.

---

## Summary Checklist for Development

- [ ] Implement Dashboard with KPIs, table, filters, search, and widgets.
- [ ] Build robust Empty States for all sections (table, activity, companies).
- [ ] Enhance Pre-diagnosis Wizard with progressive disclosure (sub-steps), chips, maturity cards, AI suggest, and review screen.
- [x] Inline company creation inside Step 1 (already implemented in StepSetup, restyled to new design system).
- [x] Use React Query to cache companies globally (already implemented in `useCompanies`, `staleTime: 60s`).
- [x] Leverage shadcn/ui for structural components (shadcn-style primitives in `components/ui/`, no BEM needed).
