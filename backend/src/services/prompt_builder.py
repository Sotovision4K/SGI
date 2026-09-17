"""Prompt template system for the ISO plan generation feature.

Security model
--------------
The plan-generation prompt is assembled from two static `.txt` templates and
developer-controlled values:

1. ``generate_plan_system.txt`` — the *system* role message. It contains
   developer-controlled placeholders like ``{company_name}``,
   ``{iso_standard}`` and ``{certification_goal}``. These are substituted via
   :py:meth:`str.format` **on the template string only**, with values coming
   from the database / ISO enum — never raw user input fed back through
   ``.format()``.

2. ``user_message_template.txt`` — the *user* role message for a single bucket.
   It contains ``{bucket_name}``, ``{clause_list}``, ``{question_answers}``
   and ``{shared_context}`` placeholders.

   ``{question_answers}`` is the security-sensitive slot: it holds bucket-local
   Q&A derived from **user answers**. To avoid ``str.format`` interpreting any
   ``{...}`` brace sequences a malicious user might inject, the answer block is
   built separately by iterating over the questions and formatting each line
   with an **f-string** (compile-time interpolation), then concatenated. The
   resulting block string is passed to ``.format`` as a *value* — and
   :py:meth:`str.format` never re-interprets the content of substituted
   values, so braces/dollar signs in user answers survive verbatim.

This keeps the developer-controlled ``.format()`` surface (the template) and
the user-controlled data (the answer block) strictly separated.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from src.services.sanitizer import MAX_FREE_TEXT_LENGTH, sanitize_single_answer

# Q: How does prompt_builder find its template and data files across environments?
# A: Env vars provide absolute paths in Lambda; __file__-relative paths serve as
#    zero-config fallback for local dev and test.
# Decision: Absolute env vars are the single source of truth. Fallback paths are
#    resolved from __file__ (not cwd) so they work regardless of working directory.
#    This is explicit, debuggable, and survives packaging changes.

_TEMPLATES_DIR: Path = Path(
    os.environ.get(
        "PROMPT_TEMPLATES_DIR",
        str(Path(__file__).resolve().parent / "prompt_templates"),
    )
)

_MAP_PATH: Path = Path(
    os.environ.get(
        "QUESTIONNAIRE_MAP_PATH",
        str(
            Path(__file__).resolve().parent.parent.parent
            / "questionnaires"
            / "questionnaire_map.json"
        ),
    )
)


# Q: Should templates be re-read from disk on every prompt build?
# A: No — they are static files. Read once and cache.
# Decision: lru_cache on load_template keeps a single copy in memory and
# avoids repeated filesystem I/O on hot paths.
@lru_cache(maxsize=16)
def load_template(name: str) -> str:
    """Load a ``.txt`` template from the templates directory.

    Parameters
    ----------
    name:
        The template file name, e.g. ``"generate_plan_system.txt"``.

    Returns
    -------
    str
        The raw template text (with ``{placeholder}`` tokens intact).

    Raises
    ------
    FileNotFoundError
        If the requested template file does not exist.
    """
    # Q: Could a caller traverse the filesystem via "../" in `name`?
    # A: Reject anything that escapes the templates directory.
    # Decision: Resolve and verify the target stays inside _TEMPLATES_DIR.
    path = (_TEMPLATES_DIR / name).resolve()
    if _TEMPLATES_DIR.resolve() not in path.parents and path != _TEMPLATES_DIR.resolve():
        raise FileNotFoundError(f"Template outside templates dir: {name!r}")
    if not path.is_file():
        raise FileNotFoundError(f"Template not found: {name!r}")
    return path.read_text(encoding="utf-8")


def build_system_prompt(
    company_name: str,
    iso_standard: str,
    certification_goal: str = "",
) -> str:
    """Build the *system* role message with safe placeholder substitution.

    Parameters
    ----------
    company_name:
        The company's name (user-supplied at company creation — sanitized here,
        not upstream).
    iso_standard:
        The ISO standard identifier, e.g. ``"iso9001"``.
    certification_goal:
        Optional human goal text, e.g. ``"Certificarnos en 6 meses"``.

    Returns
    -------
    str
        The fully-rendered system prompt.

    Note
    ----
    ``str.format`` is only applied to the TEMPLATE — the three values above are
    developer-controlled. Even if ``company_name`` contained stray braces, they
    would be substituted as a *value* and never re-interpreted by ``.format``.
    """
    # Q: How do we avoid leaving an empty line when certification_goal is blank?
    # A: Substitute an explicit neutral default so the template renders cleanly.
    # Decision: Pass the goal through as-is; an empty string simply renders the
    # placeholder as blank, which is acceptable and keeps the call simple.
    template = load_template("generate_plan_system.txt")
    return template.format(
        company_name=sanitize_single_answer(company_name),
        iso_standard=iso_standard,
        certification_goal=certification_goal,
    )


def build_certification_goal(pre_diagnosis: dict[str, Any] | None = None) -> str:
    """Compose a concise Spanish certification-goal summary from pre-diagnosis.

    The goal is user input captured in the pre-diagnosis "Objetivos de
    certificación" group (``pd_target_date``/``pd_motivation``/``pd_cert_type``/
    ``pd_scope``) plus the ``pd_objectives`` chips. It feeds the system prompt's
    prominent "Objetivo de certificación" section (decision 20).

    Returns "" when no goal-related fields are present.
    """
    if not pre_diagnosis:
        return ""

    def _clean(value: Any) -> str:
        # Sanitize each field — the goal text is user-derived and reaches the
        # system prompt, so it gets the same injection scrub as answers.
        return sanitize_single_answer(str(value))

    parts: list[str] = []
    target = pre_diagnosis.get("pd_target_date")
    cert_type = pre_diagnosis.get("pd_cert_type")
    motivation = pre_diagnosis.get("pd_motivation")
    scope = pre_diagnosis.get("pd_scope")
    objectives = pre_diagnosis.get("pd_objectives")

    if target:
        parts.append(f"Certificarse en {_clean(target)}")
    if cert_type:
        parts.append(f"({_clean(cert_type)})")
    if motivation:
        parts.append(f"motivado por {_clean(motivation)}")
    if scope:
        parts.append(f"alcance: {_clean(scope)}")
    if objectives:
        if isinstance(objectives, (list, tuple)):
            objectives = ", ".join(_clean(o) for o in objectives)
        else:
            objectives = _clean(objectives)
        parts.append(f"objetivos estratégicos: {objectives}")

    return " ".join(parts)


def build_shared_context(
    company_name: str,
    iso_standard: str,
    pre_diagnosis: dict[str, Any] | None = None,
    certification_goal: str = "",
    free_text: str = "",
) -> str:
    """Build the shared context block common to every bucket message.

    Parameters
    ----------
    company_name:
        Company name (developer-controlled / from DB).
    iso_standard:
        ISO standard identifier.
    pre_diagnosis:
        Optional mapping of pre-diagnosis fields (e.g. ``pd_sector``).
    certification_goal:
        Optional certification goal text.
    free_text:
        Optional user free-form notes from the diagnosis (sanitized).

    Returns
    -------
    str
        A plain-text block (no ``{...}`` placeholders) summarising the shared
        context. User-derived values are inserted via f-strings, so braces in
        them are literal text.
    """
    # Q: How is pre-diagnosis (which is user-derived) rendered safely?
    # A: Iterate and format each row with an f-string — never .format() on a
    #    string that contains user data.
    # Decision: f-strings are compile-time, so any ``{...}`` inside a value
    # remains literal and cannot be interpreted as a format token.
    lines: list[str] = [
        f"- Empresa: {sanitize_single_answer(company_name)}",
        f"- Norma ISO: {iso_standard}",
    ]
    if certification_goal:
        lines.append(f"- Objetivo de certificación: {certification_goal}")

    if pre_diagnosis:
        lines.append("- Pre-diagnóstico:")
        for key, value in pre_diagnosis.items():
            # f-string interpolation: `value` is inserted verbatim; braces
            # or '$' inside it are NOT treated as format tokens. The value is
            # still scrubbed for injection phrases (defense in depth).
            lines.append(f"  - {key}: {sanitize_single_answer(str(value))}")

    if free_text:
        # Scrub then hard-truncate (mirrors sanitize_findings) so a single
        # unbounded free-text note can't bloat all 3 bucket prompts × retries.
        cleaned = sanitize_single_answer(free_text)[:MAX_FREE_TEXT_LENGTH]
        lines.append(f"- Notas libres del diagnóstico: {cleaned}")

    return "\n".join(lines)


def build_bucket_prompt(
    bucket_name: str,
    clause_list: list[str],
    questions: list[dict],
    answers: dict[str, str],
    company_name: str | None = None,
    iso_standard: str | None = None,
    pre_diagnosis: dict[str, Any] | None = None,
    certification_goal: str = "",
    free_text: str = "",
) -> str:
    """Build the *user* role message for a single bucket.

    Parameters
    ----------
    bucket_name:
        Human name of the bucket (developer-controlled label), e.g.
        ``"Contexto de la organización"``.
    clause_list:
        ISO clause numbers covered by this bucket, e.g. ``["4.1", "4.2"]``.
    questions:
        List of question descriptors, each with keys ``question_id``,
        ``clause`` and ``es_label``.
    answers:
        Mapping of ``question_id`` -> sanitized answer text.
    company_name, iso_standard, pre_diagnosis, certification_goal, free_text:
        Optional shared-context inputs. When provided they're rendered into the
        ``{shared_context}`` slot so the bucket message is self-contained.

    Returns
    -------
    str
        The fully-rendered user message with no lingering ``{...}`` tokens.

    Security
    --------
    User answers are assembled into ``question_answers`` via f-strings. The
    resulting block is then passed as a *value* to ``.format()`` on the
    template — :py:meth:`str.format` does not re-interpret substituted
    values, so any ``{...}``/``$`` inside an answer survives verbatim.
    """
    # Q: How are per-question answer lines built so user braces are safe?
    # A: With a compile-time f-string per line: f"- [{clause}] {es_label}: {answer}"
    # Decision: This is the user-decided safe approach — f-strings have no
    # second .format() pass, so injected braces cannot become format tokens.
    answer_lines: list[str] = []
    for entry in questions:
        qid = entry.get("question_id")
        if qid is None:
            continue
        if qid not in answers:
            # Skip questions that have no answer — keeps the prompt honest
            # and avoids emitting empty lines.
            continue
        clause = entry.get("clause", "—")
        es_label = entry.get("es_label", qid)
        # Q: Should the prompt builder sanitize answers itself, or trust the caller?
        # A: Sanitize here as defense-in-depth — the security audit (C-2) requires
        #    sanitization at the prompt-builder boundary, not just upstream.
        # Decision: Call sanitize_single_answer on every answer. Even if the
        #    caller already sanitized, double-sanitization is idempotent
        #    ([FILTERED] text won't match patterns a second time).
        raw_answer = str(answers[qid])
        sanitized_answer = sanitize_single_answer(raw_answer)
        line = f"- [{clause}] {es_label}: {sanitized_answer}"
        answer_lines.append(line)

    question_answers_block = "\n".join(answer_lines)

    # Q: What about the shared context slot?
    # A: Build it (user data via f-strings) and pass as a VALUE to .format().
    # Decision: Reuse build_shared_context so the bucket message carries the
    # common framing without duplicating the safe-rendering logic.
    if company_name is not None and iso_standard is not None:
        shared_context = build_shared_context(
            company_name=company_name,
            iso_standard=iso_standard,
            pre_diagnosis=pre_diagnosis,
            certification_goal=certification_goal,
            free_text=free_text,
        )
    else:
        shared_context = (
            f"- Empresa: {company_name or '—'}\n- Norma ISO: {iso_standard or '—'}"
        )

    # Q: Why is it safe to call .format() here even though question_answers_block
    #    may contain user-injected braces?
    # A: The template string is the ONLY thing .format() parses for tokens.
    #    question_answers_block / shared_context are passed as VALUES, and
    #    str.format never re-interprets substituted values.
    # Decision: Format the static template with developer-controlled labels +
    # the pre-built user-data blocks. This is the chosen safe approach.
    template = load_template("user_message_template.txt")

    # Format clause_list as a readable comma-separated string.
    clause_list_str = ", ".join(clause_list) if clause_list else "—"

    return template.format(
        shared_context=shared_context,
        bucket_name=bucket_name,
        clause_list=clause_list_str,
        question_answers=question_answers_block,
    )


# ---------------------------------------------------------------------------
# Questionnaire map loader
# ---------------------------------------------------------------------------
# Q: How does prompt_builder consume questionnaire_map.json?
# A: Through three functions: load the map → filter by standard → group by bucket.
# Decision: Cache the entire map in memory (lru_cache) since it's read-only
#    config that changes only at deploy time. No file-watching needed.


@lru_cache(maxsize=1)
def load_questionnaire_map() -> dict[str, Any]:
    """Load and cache the full questionnaire_map.json.

    Returns the complete map dict: ``{"buckets": {...}, "iso9001": [...], ...}``.

    Raises
    ------
    FileNotFoundError
        If ``questionnaire_map.json`` does not exist at the expected path.
    """
    # Q: What happens if the file is missing or malformed?
    # A: Let the exception propagate — a missing map is a deploy error that
    #    should crash the worker, not silently produce bad prompts.
    # Decision: Fail fast. No fallback, no default.
    resolved = _MAP_PATH.resolve()
    if not resolved.is_file():
        raise FileNotFoundError(
            f"questionnaire_map.json not found at {resolved}"
        )
    with resolved.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def get_questions_for_standard(
    iso_standard: str,
) -> list[dict[str, Any]]:
    """Return the question entries for a given ISO standard.

    Parameters
    ----------
    iso_standard:
        Standard key as it appears in the map, e.g. ``"iso9001"``.

    Returns
    -------
    list[dict]
        Each dict has keys ``question_id``, ``es_label``, ``clause``,
        ``group``, ``bucket``.

    Raises
    ------
    KeyError
        If ``iso_standard`` is not a key in the map.
    """
    # Q: Should this validate the standard key?
    # A: Yes — a typo like "iso90001" should raise immediately, not silently
    #    return empty. Deploy-time validation catches this.
    # Decision: Direct key access → KeyError on unknown standard.
    return list(load_questionnaire_map()[iso_standard])


def group_by_bucket(
    questions: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Group question entries by their bucket key (B1, B2, B3).

    Parameters
    ----------
    questions:
        Flat list of question entries from the map.

    Returns
    -------
    dict[str, list[dict]]
        ``{"B1": [...], "B2": [...], "B3": [...]}`` — bucket keys are
        guaranteed to be present (empty lists if no questions match).
    """
    # Q: Should we guarantee all three bucket keys are present even if empty?
    # A: Yes — the worker iterates all three buckets unconditionally.
    #    Returning only populated buckets would cause silent skips.
    # Decision: Pre-initialize with empty lists so the caller can safely
    #    iterate B1/B2/B3 without checking for key existence.
    grouped: dict[str, list[dict[str, Any]]] = {"B1": [], "B2": [], "B3": []}
    for entry in questions:
        bucket = entry.get("bucket")
        if bucket in grouped:
            grouped[bucket].append(entry)
    return grouped


def get_bucket_metadata(bucket_key: str) -> dict[str, Any]:
    """Return the legend metadata for a bucket (name + groups).

    Parameters
    ----------
    bucket_key:
        ``"B1"``, ``"B2"``, or ``"B3"``.

    Returns
    -------
    dict
        ``{"name": "Liderazgo", "groups": ["liderazgo"]}``.
    """
    # Q: Why a separate function instead of inline dict access?
    # A: Encapsulates the map structure. If the legend format changes,
    #    only this function needs updating.
    # Decision: Thin wrapper over the map's buckets key.
    return load_questionnaire_map()["buckets"][bucket_key]