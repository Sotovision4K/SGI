---
description: Enrich the UI of a single component or a full page
---

Apply a focused UI enrichment to a single component or an entire page. The command makes minimal, review-friendly changes (Tailwind-first) and records intent and concerns so reviewers understand the UX rationale.

Behavior:

- Works in "component" or "page" mode and patches the target file(s) with a small visual/UX preset.
- Does not implement full feature logic; it scaffolds layout, markup, utility classes, ARIA hooks, and optional mock data for visualization.
- Generates a brief `CHANGELOG` entry and a short inline comment in the modified file describing the enrichment intent.

Positional arguments & flags:

- Positional arguments (preferred):
  - $1 — `target` — either `component` or `page` (required).
  - With this concerns $2
- Flags (optional aliases and additional options):
  - `--target=component|page` — alias for `$1`.
  - `--layout=<style>` — layout style preset. Examples: `stacked`, `grid`, `two-column`, `hero`, `panel`.
  - `--ux=<tone>` — UX approach to apply. Examples: `friendly`, `compact`, `accessible`, `data-dense`.
  - `--intention="<text>"` — short human-readable statement of the enrichment goal (why: focus, surface, metric, onboarding).
  - `--concerns="<text>"` — comma-separated concerns to consider (performance,a11y,seo,responsiveness,analytics,localization).
  - `--variant=<compact|detailed>` — size/detail variant for the preset.
  - `--with-hook=<hookName>` — (optional) wire an existing hook (e.g. `useProcess`) for scaffolded data usage; import path discovery is attempted based on common paths.
  - `--apply|--dry-run` — `--dry-run` shows the proposed patch; `--apply` writes changes. Default: `--dry-run`.
  - `--preserve-classes` — avoid rewriting existing utility class names; only adds wrapper markup and comments.

Notes:

- If both positional args and flags are provided, positional args take precedence for `target` and `path`.
- Use `--dry-run` to preview changes; the generator will output a unified patch and a suggested changelog entry before writing files.

Output & safety:

- The command will create a small patch (or preview) showing changed lines and an appended changelog note under `.opencode/CHANGES.md` with the `intention` and `concerns` metadata.
- It will avoid overwriting business logic and will not add new dependencies; chart placeholders recommend a library but only add commented import hints.

Reviewer guidance:

- Include the `intention` in PR description — it will also be appended to `.opencode/CHANGES.md` by the generator.
- Run automated a11y checks when `--ux=accessible` is used and prefer `--preserve-classes` when patching complex UIs.

Notes:

- By design this command prioritizes small, reviewable diffs and clear intent metadata over large refactors.
- If you want full redesign, run the command in `dry-run` to preview and then iterate with `--apply` once satisfied.
