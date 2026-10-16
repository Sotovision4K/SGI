from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from src.domain.entities.plan import Task


@dataclass
class SegmentResult:
    """Result of generating a single plan segment (bucket).

    # Q: Why a dataclass instead of returning a full `Plan`?
    # A: A segment is a *partial* plan — the summary + tasks for one bucket —
    #    plus observability fields (usage/latency) the worker writes to the
    #    audit log. The adapter never assembles the whole plan; the worker
    #    merges segments in code (§5).
    """

    summary_md: str = ""
    tasks: list[Task] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0


@dataclass
class StructuredResult:
    """Result of a generic structured (tool-use) LLM call.

    Unlike ``SegmentResult`` this is not plan-specific: it returns the raw
    tool input dict plus usage/latency. Used by the profiling analysis, which
    sends the whole context in one call (no segmentation) and parses the tool
    input into a ``ProfilingResult``.
    """

    data: dict[str, Any] = field(default_factory=dict)
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0


@runtime_checkable
class LLMPort(Protocol):
    async def generate_segment(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        max_tokens: int = 4096,
        timeout_seconds: float = 180.0,
    ) -> SegmentResult:
        ...

    async def generate_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tool_schema: dict[str, Any],
        tool_name: str,
        max_tokens: int = 8192,
        timeout_seconds: float = 300.0,
    ) -> StructuredResult:
        ...

