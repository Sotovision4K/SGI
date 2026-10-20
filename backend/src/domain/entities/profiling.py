"""Profiling analysis domain entity.

The profiling analysis (``POST /profiling/analyze``) returns a single structured
result produced by one LLM call over the whole profiling context (no chunking):

- a markdown narrative of the most important pain points,
- a cost estimate,
- a time estimate,
- an action plan.

The shape mirrors the frontend ``ProfilingResult`` type in
``frontend/src/api/profiling.ts`` (single source of truth for the wire contract).
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Confidence(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class CostEstimation(BaseModel):
    range_cop: str = ""
    breakdown: list[str] = Field(default_factory=list)
    confidence: Confidence = Confidence.MEDIUM


class TimeEstimation(BaseModel):
    months: int = 0
    phases: list[str] = Field(default_factory=list)
    confidence: Confidence = Confidence.MEDIUM


class ActionPlanPhase(BaseModel):
    name: str = ""
    duration_weeks: int = 0
    activities: list[str] = Field(default_factory=list)


class ActionPlan(BaseModel):
    phases: list[ActionPlanPhase] = Field(default_factory=list)
    milestones: list[str] = Field(default_factory=list)


class ProfilingResult(BaseModel):
    pain_points_analysis: str = ""
    cost_estimation: CostEstimation = Field(default_factory=CostEstimation)
    time_estimation: TimeEstimation = Field(default_factory=TimeEstimation)
    action_plan: ActionPlan = Field(default_factory=ActionPlan)


# ---------------------------------------------------------------------------
# Strict write-boundary variants (PUT /processes/{id}/analysis)
# ---------------------------------------------------------------------------
# The lenient ``ProfilingResult`` above is the LLM-output contract: ``parser.py``
# relies on every field having a default so malformed model output degrades to
# defaults instead of raising. At the HTTP persistence boundary we want the
# opposite — reject empty / partial / unknown-key payloads — so this is the same
# shape re-declared with strict validation and no defaults.
#
# # Q: Why is `Confidence` marked `Field(strict=False)`?
# # A: The wire format is JSON, which has no enum instances — the value is always
# #    the plain string ("high"/"medium"/"low"). Model-level `strict=True` would
# #    reject that string, so enum fields opt out while every other field stays
# #    strict (rejects "6" for an int, accepts 6).
# Decision: duplicate the shape rather than tighten `ProfilingResult`, which the
#    LLM parser depends on being lenient.


class StrictCostEstimation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    range_cop: str = Field(min_length=1, max_length=500)
    breakdown: list[str] = Field(min_length=1, max_length=50)
    confidence: Confidence = Field(strict=False)


class StrictTimeEstimation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    months: int = Field(ge=0)
    phases: list[str] = Field(min_length=1, max_length=50)
    confidence: Confidence = Field(strict=False)


class StrictActionPlanPhase(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: str = Field(min_length=1, max_length=200)
    duration_weeks: int = Field(ge=0)
    activities: list[str] = Field(min_length=1, max_length=50)


class StrictActionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    phases: list[StrictActionPlanPhase] = Field(min_length=1, max_length=50)
    milestones: list[str] = Field(min_length=1, max_length=50)


class StrictProfilingResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    pain_points_analysis: str = Field(min_length=1, max_length=20000)
    cost_estimation: StrictCostEstimation
    time_estimation: StrictTimeEstimation
    action_plan: StrictActionPlan
