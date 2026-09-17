---
description: Run gates (lint + tests) then launch security-auditor + code-reviewer in parallel and aggregate findings.
model: opencode-go/deepseek-v4-pro
---

# Review Command

Review the current work: $ARGUMENTS

Run the standard "review gate" — the closeout for any code change in this project. This is the loop that must happen before moving on: **gates → dual review (security + code) → fix → document**.

## 1. Determine scope

- If `$ARGUMENTS` names a phase/feature (e.g. "Phase 4", "plan generation"), read its section in `.opencode/docs/*.md` to identify which files it touched.
- Otherwise, use git to find the changed files:
  ```bash
  git status --short
  git diff --name-only HEAD
  ```
- Build a concrete file list to hand to the reviewers. Default to the backend (`backend/src/`, `backend/tests/`) unless the change is frontend or infra.

## 2. Run verification gates

```bash
cd backend && uv run ruff check . && uv run pytest -q
```

Report the pass/fail counts explicitly. If the gates fail, stop and report — do not launch reviewers on red code.

## 3. Launch reviewers in parallel

Use the `task` tool to spawn **both** subagents simultaneously (they are independent). Give each a detailed prompt containing:

- the concrete file list from step 1
- project context: FastAPI + SQLModel + async SQLAlchemy, AWS Lambda via Mangum, SQS, Supabase Postgres; local tests on in-memory SQLite (aiosqlite); Python 3.12; `ruff` + `pytest`
- instruction: return findings in descending severity (critical → high → medium → low) with `file:line`, explanation, and a suggested fix — and **do NOT modify code**

| Agent | `subagent_type` | Focus |
|-------|-----------------|-------|
| security-auditor | `security-auditor` | injection, authn/authz, SQL injection, race/TOCTOU, info leakage, DoS |
| code-reviewer | `code-reviewer` | correctness, bugs, performance, architecture, maintainability |

Call out these **project-specific pitfalls** in both prompts (the recurring bugs in this codebase):

- SQLite does **not** enforce `VARCHAR(n)` — a field that isn't clamped passes locally and blows up on Postgres.
- The stale-lease/redelivery model: a failed claim must **raise** (redeliver), not **return** (delete) — otherwise the job wedges at `running`.
- Ownership: `consultant_id` must be checked atomically inside every `UPDATE`, not just in a pre-read.
- `.format()` must never touch user-controlled strings (f-strings for values).
- Sanitize both user-derived fields (`free_text`, `pre_diagnosis`, `company_name`) and LLM-derived output (`summary_md`, `description`, `document_title`).

## 4. Aggregate findings

Merge both reports into **one** table, deduping overlapping findings (a bug often shows up in both). Order by severity. Columns: `# | Sev | Finding | Where (file:line) | Disposition (Fix / Defer / Note)`.

## 5. Propose dispositions and act

- **Fix** the blocking items (Critical/High) — implement, re-run the gates, and add a regression test for each.
- **Defer/Note** the rest, each with a one-line reason.
- Report the summary: `N critical · N high · N medium · N low`.

## 6. Record it

If a matching design doc exists under `.opencode/docs/`, append a "Review findings" section with the merged table + dispositions, and update its "Verification gates" (test count) and "Status" line.

## Checklist

- [ ] Gates green (`ruff` + `pytest`) before reviewing
- [ ] Both reviewers ran in parallel
- [ ] Merged severity table produced
- [ ] Blocking findings fixed + regression-tested
- [ ] Findings recorded in the design doc
