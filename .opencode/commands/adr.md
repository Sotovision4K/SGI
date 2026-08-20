---
description: Compact the current design conversation into a decision record (decisions, trade-offs, concerns, open questions, checklist).
---

# Architecture Decision Record (ADR) Workflow

Collapse everything discussed and decided in the current design conversation into a single, compact, decision-ready record. Do **not** invent new requirements — only capture what was actually discussed and decided. Explicitly record trade-offs and the reasons behind each choice, and preserve any open question.

Work from the conversation (and, if useful, `.opencode/docs/` feature files) to produce the record with these sections, in this order:

1. **Goal & current state** — one or two lines: what the feature must do, and the relevant today (endpoints, adapters, schema, persistence).
2. **Hard constraints** — facts that forced decisions (e.g. API Gateway timeouts, Lambda limits, `create_all` behavior, dependency/test commands), with file:line evidence where possible.
3. **Key questions → decisions → why** — the decision points that came up, each as: the question asked, the choice made, and the reasoning/trade-off. Use a compact table.
4. **Final architecture** — a short flow diagram or numbered steps of the agreed design.
5. **Data model / schema** — any new or changed tables/entities and their fields.
6. **Failure / retry / observability** — the retry ladder, DLQ/redrive, audit/user-facing behavior.
7. **Endpoints** — new vs modified, with behavior and status codes.
8. **Not building** — explicit exclusions and deferred work, stated so scope is clear.
9. **Open concerns / risks** — remaining issues and their mitigations.
10. **Execution checklist** — the ordered implementation steps.

## Formatting rules

- Use the frontmatter `---` block only when updating a real doc; when returning in-chat, emit the record as plain Markdown.
- Keep it **compact**: prefer tables and bullets over prose. Do not pad.
- End with a one-line status: `Status: plan finalized alongside <guide doc>` when applicable, and confirm explicitly what is ready to implement.

## Do

- Read the existing feature/design doc (e.g. under `.opencode/docs/`) and reconcile the record with it.
- Flag any fields where the current entity schema differs from what was specified.
- Ask no new questions: close only decisions already made, and list anything unknown under Open questions.

## Don't

- Do not add requirements that were not discussed.
- Do not rewrite history: capturing the decision as it actually happened, in our opinions.