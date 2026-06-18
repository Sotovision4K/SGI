from typing import Protocol, runtime_checkable

from src.domain.entities.plan import Plan


@runtime_checkable
class LLMPort(Protocol):
    async def generate_plan(self, iso_standard: str, findings: dict) -> Plan:
        ...
