---
description: Create a react component
---

Create a react component named $1 in folder $2 with arguments $3.

With flags $4

UI Templatees $5

This command scaffolds a minimal, Tailwind-friendly React component and optionally applies a lightweight UI "enrichment" (visual template) such as a card, list, table, or chart placeholder. It intentionally skips TypeScript-specific scaffolding (per project preference) and focuses on quick, easy-to-review UI presets and optional hook integration.

Flags / options:

- `--with-hook=<hookName>` — import and wire a data hook (e.g. `useProcess`).
- `--visualization=<template>` — apply a UI preset. Allowed: `card`, `list`, `table`, `chart`, `kpi`.
- `--variant=<compact|detailed>` — choose a compact or detailed layout for the template.
- `--story` — generate a Storybook story placeholder for the component.
- `--test` — generate a minimal test file under the component `__tests__` folder.
- `--dry-run` — show files that would be created without writing them.

Templates (what `--visualization` scaffolds):

- `card` — a responsive card with title, description and CTA placeholder.
- `list` — item list layout with simple item row component.
- `table` — table structure with header and responsive rows.
- `chart` — a placeholder wrapping for a chart area (mock data + import comment for a chart library).
- `kpi` — compact KPI tile with icon, number, and label.
.

Post-generation notes:

- The generator will use Tailwind utility classes by default; confirm project tokens are in `tailwind.config.js`.
- After generation: add the component export to your barrel file (if you use one), optionally add a route or import in a page, run lint/format.
- Accessibility: generated templates include basic aria roles; please validate with your a11y tooling.

Keep the output minimal and reviewable — the `enrich-component` step is intended to apply a small, review-friendly UI preset rather than a complete feature implementation.

If you want, I can now apply this enriched command doc to the repository (done) and optionally scaffold a concrete component using the `card` template wired to `useProcess`.
