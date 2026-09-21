from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from src.domain.entities.plan import Plan, Task


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


@runtime_checkable
class LLMPort(Protocol):
    async def generate_plan(self, iso_standard: str, findings: dict, pre_diagnosis: dict | None = None) -> Plan:
        ...

    async def generate_segment(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        max_tokens: int = 4096,
        timeout_seconds: float = 180.0,
    ) -> SegmentResult:
        ...
