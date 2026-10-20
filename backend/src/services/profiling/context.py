"""Profiling context retriever.

The "retriever" half of the profiling abstraction: given a ``Process`` and a
company name, assemble the exact context the LLM needs — the module label, the
answered profiling questions in questionnaire order, and the auditor's
free-text pain points. Prompt rendering lives in
``src.services.profiling.prompts``; this module never builds prompts.

Security
--------
Every user-derived value (company name, answer text, pain points) passes
through :func:`sanitize_single_answer` at this boundary, mirroring
``prompt_builder.build_shared_context``. The pain-point free text is additionally
hard-truncated to ``MAX_FREE_TEXT_LENGTH`` so a single unbounded note cannot
bloat the request.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from src.domain.entities.process import Process
from src.services.sanitizer import MAX_FREE_TEXT_LENGTH, sanitize_single_answer

# Q: How does the retriever find profiling.json across environments?
# A: An env var provides the absolute path in Lambda; a __file__-relative path
#    is the zero-config fallback for local dev and tests.
# Decision: Resolve the fallback from __file__ (not cwd) so it works regardless
#    of working directory, matching prompt_builder's file-loading convention.
_DEFAULT_QUESTIONNAIRE_PATH: Path = (
    Path(__file__).resolve().parents[3] / "questionnaires" / "profiling.json"
)

# Always-visible questionnaire groups. Every other group is module-specific and
# is only included when it matches the process's selected module.
_BASE_GROUP_IDS: frozenset[str] = frozenset({"perfil", "contexto", "selector"})


# Q: Should the questionnaire be re-read from disk on every context build?
# A: No — it is static configuration that only changes at deploy time.
# Decision: lru_cache keeps a single parsed copy in memory and avoids repeated
#    filesystem I/O on the hot profiling path.
@lru_cache(maxsize=1)
def load_questionnaire() -> dict[str, Any]:
    """Load and cache the profiling questionnaire.

    Returns the parsed ``profiling.json`` document. Raises ``FileNotFoundError``
    when the file is missing (a deploy error that should fail fast rather than
    silently produce an empty context).
    """
    path = Path(
        os.environ.get(
            "PROFILING_QUESTIONNAIRE_PATH",
            str(_DEFAULT_QUESTIONNAIRE_PATH),
        )
    )
    resolved = path.resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"profiling.json not found at {resolved}")
    with resolved.open("r", encoding="utf-8") as fh:
        return json.load(fh)


# Q: Build the {question_id: (label, group_id)} index once or per process?
# A: Once — the questionnaire is immutable for the lifetime of the process.
# Decision: Cache the flattened index alongside load_questionnaire. Python
#    dicts preserve insertion order, matching questionnaire order.
@lru_cache(maxsize=1)
def _question_index() -> dict[str, tuple[str, str]]:
    """Flatten the questionnaire into ``{question_id: (label, group_id)}``."""
    index: dict[str, tuple[str, str]] = {}
    for group in load_questionnaire().get("groups", []):
        group_id = str(group.get("id", ""))
        for question in group.get("questions", []):
            question_id = question.get("id")
            if question_id is None:
                continue
            index[str(question_id)] = (
                str(question.get("label", question_id)),
                group_id,
            )
    return index


@dataclass(frozen=True)
class ProfilingContext:
    """Immutable, prompt-ready view of a process's profiling data."""

    company_name: str
    module: str
    module_label: str
    qa: list[tuple[str, str]]
    pain_points: str


def _render_answer(value: Any) -> str:
    """Render a stored answer as a single sanitized string.

    Lists/tuples (chips answers) are joined with ``", "``; everything else is
    coerced with ``str``. The result is sanitized and trimmed; an answer that
    sanitizes to empty yields ``""`` so the caller can skip it.
    """
    if isinstance(value, (list, tuple)):
        rendered = ", ".join(str(item) for item in value)
    else:
        rendered = str(value)
    return sanitize_single_answer(rendered).strip()


def build_context(process: Process, company_name: str | None) -> ProfilingContext:
    """Build a :class:`ProfilingContext` from a process and company name."""
    # Q: How do we derive the module and its human label?
    # A: The stored enum value is the module id; its label is the matching
    #    group's title from the questionnaire.
    # Decision: Unset module -> "" for both; unknown id -> "" label.
    module = (
        process.perfilamiento_module.value if process.perfilamiento_module else ""
    )
    module_label = ""
    if module:
        for group in load_questionnaire().get("groups", []):
            if group.get("id") == module:
                module_label = str(group.get("title", ""))
                break

    answers = process.perfilamiento_answers or {}

    # Q: In what order are Q&A pairs emitted, and which answers are included?
    # A: Questionnaire order, including only questions that have a non-empty
    #    sanitized answer. The special "pain_points" key is handled separately.
    #    Only the always-visible base groups and the selected module group are
    #    included — answers saved under other modules never reach the prompt.
    # Decision: Walk the questionnaire so the LLM sees a stable, human-readable
    #    order rather than the arbitrary dict order of perfilamiento_answers.
    qa: list[tuple[str, str]] = []
    for group in load_questionnaire().get("groups", []):
        group_id = str(group.get("id", ""))
        if group_id not in _BASE_GROUP_IDS and group_id != module:
            continue
        for question in group.get("questions", []):
            question_id = question.get("id")
            if question_id is None or question_id == "pain_points":
                continue
            if question_id not in answers:
                continue
            rendered = _render_answer(answers[question_id])
            if not rendered:
                continue
            label = str(question.get("label", question_id))
            qa.append((label, rendered))

    pain_points = sanitize_single_answer(
        str(answers.get("pain_points", ""))
    )[:MAX_FREE_TEXT_LENGTH]

    return ProfilingContext(
        company_name=sanitize_single_answer(company_name or ""),
        module=module,
        module_label=module_label,
        qa=qa,
        pain_points=pain_points,
    )
