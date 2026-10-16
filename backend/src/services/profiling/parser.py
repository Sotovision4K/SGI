"""Profiling response parser.

Turns the untrusted tool-input dict returned by the LLM into a validated
``ProfilingResult``. The LLM output is treated as hostile: every field is
coerced, cleaned (markdown-sanitized) and defaulted so a malformed response
never raises — it just yields empties.
"""

from __future__ import annotations

from typing import Any

from src.domain.entities.profiling import (
    ActionPlan,
    ActionPlanPhase,
    Confidence,
    CostEstimation,
    ProfilingResult,
    TimeEstimation,
)
from src.services.sanitizer import sanitize_markdown


def _to_str(value: Any) -> str:
    """Coerce a value to a string, mapping None to an empty string."""
    return "" if value is None else str(value)


def _to_int(value: Any) -> int:
    """Coerce a value to an int, defaulting to 0 on failure.

    Accepts ints, floats and digit strings (optionally signed); bools are
    rejected (``True`` is not a meaningful duration).
    """
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    try:
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped and stripped.lstrip("-").isdigit():
                return int(stripped)
    except (TypeError, ValueError, OverflowError):
        return 0
    return 0


def _to_str_list(value: Any) -> list[str]:
    """Normalize a value to a list of sanitized, non-empty strings.

    A lone string is treated as a one-item list; any other type (including
    None) yields an empty list.
    """
    if isinstance(value, str):
        items: list[Any] = [value]
    elif isinstance(value, list):
        items = value
    else:
        return []

    result: list[str] = []
    for item in items:
        cleaned = sanitize_markdown(_to_str(item)).strip()
        if cleaned:
            result.append(cleaned)
    return result


def _to_confidence(value: Any) -> Confidence:
    """Map a value to ``Confidence``, defaulting to MEDIUM when unknown."""
    if isinstance(value, Confidence):
        return value
    try:
        return Confidence(str(value).strip().lower())
    except (ValueError, TypeError):
        return Confidence.MEDIUM


def _parse_cost(raw: Any) -> CostEstimation:
    if not isinstance(raw, dict):
        return CostEstimation()
    return CostEstimation(
        range_cop=sanitize_markdown(_to_str(raw.get("range_cop"))),
        breakdown=_to_str_list(raw.get("breakdown")),
        confidence=_to_confidence(raw.get("confidence")),
    )


def _parse_time(raw: Any) -> TimeEstimation:
    if not isinstance(raw, dict):
        return TimeEstimation()
    return TimeEstimation(
        months=_to_int(raw.get("months")),
        phases=_to_str_list(raw.get("phases")),
        confidence=_to_confidence(raw.get("confidence")),
    )


def _parse_action_plan(raw: Any) -> ActionPlan:
    if not isinstance(raw, dict):
        return ActionPlan()

    phases: list[ActionPlanPhase] = []
    raw_phases = raw.get("phases")
    if isinstance(raw_phases, list):
        for raw_phase in raw_phases:
            if not isinstance(raw_phase, dict):
                continue
            name = sanitize_markdown(_to_str(raw_phase.get("name"))).strip()
            if not name:
                continue
            phases.append(
                ActionPlanPhase(
                    name=name,
                    duration_weeks=_to_int(raw_phase.get("duration_weeks")),
                    activities=_to_str_list(raw_phase.get("activities")),
                )
            )

    return ActionPlan(
        phases=phases,
        milestones=_to_str_list(raw.get("milestones")),
    )


def parse_result(raw: dict) -> ProfilingResult:
    """Parse a raw tool-input dict into a validated ``ProfilingResult``.

    Defensive by contract: non-dict/None input is treated as empty and every
    malformed field falls back to its default instead of raising.
    """
    if not isinstance(raw, dict):
        raw = {}

    return ProfilingResult(
        pain_points_analysis=sanitize_markdown(
            _to_str(raw.get("pain_points_analysis"))
        ),
        cost_estimation=_parse_cost(raw.get("cost_estimation")),
        time_estimation=_parse_time(raw.get("time_estimation")),
        action_plan=_parse_action_plan(raw.get("action_plan")),
    )
