import json
import uuid
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic
from fastapi import Depends

from src.config.settings import Settings, get_settings
from src.domain.entities.plan import Plan, Task, TaskPriority
from src.adapters.llm.llm_port import LLMPort


_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_system_prompt(iso_standard: str) -> str:
    template = (_PROMPTS_DIR / "diagnose_system.md").read_text(encoding="utf-8")
    return template.format(iso_standard=iso_standard)


def _load_tool_schema() -> dict[str, Any]:
    return json.loads((_PROMPTS_DIR / "plan_tool.json").read_text(encoding="utf-8"))


def _priority_value(value: str) -> TaskPriority:
    try:
        return TaskPriority(value)
    except ValueError:
        return TaskPriority.MEDIUM


class AnthropicAdapter:
    """Anthropic Claude implementation of the LLM port using tool-use for structured output."""

    def __init__(self, api_key: str, model: str) -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def generate_plan(self, iso_standard: str, findings: dict) -> Plan:
        system_prompt = _load_system_prompt(iso_standard)
        tool_schema = _load_tool_schema()
        user_message = (
            "## Respuestas del diagnóstico\n\n"
            f"```json\n{json.dumps(findings, ensure_ascii=False, indent=2)}\n```\n\n"
            "Analiza estas respuestas y genera el plan de acción usando la herramienta "
            "`emit_action_plan`."
        )

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=system_prompt,
            tools=[tool_schema],
            tool_choice={"type": "tool", "name": "emit_action_plan"},
            messages=[{"role": "user", "content": user_message}],
        )

        tool_input = self._extract_tool_input(response)
        return self._build_plan(tool_input)

    def _extract_tool_input(self, response: Any) -> dict[str, Any]:
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "emit_action_plan":
                return block.input
        raise ValueError("LLM did not call emit_action_plan tool")

    def _build_plan(self, tool_input: dict[str, Any]) -> Plan:
        plan_id = uuid.uuid4()
        plan = Plan(
            id=plan_id,
            process_id=uuid.uuid4(),  # placeholder, caller will set
            summary_md=tool_input.get("summary_md", "").strip(),
            tasks=[],
        )
        for index, raw_task in enumerate(tool_input.get("tasks", [])):
            plan.tasks.append(
                Task(
                    id=uuid.uuid4(),
                    plan_id=plan_id,
                    title=raw_task.get("title", "").strip()[:200],
                    description=raw_task.get("description", "").strip(),
                    priority=_priority_value(raw_task.get("priority", "medium")),
                    estimated_effort=raw_task.get("estimated_effort", "").strip()[:100],
                    owner_role=raw_task.get("owner_role", "").strip()[:100],
                    sort_order=index,
                )
            )
        return plan


def get_anthropic_adapter(settings: Settings = Depends(get_settings)) -> LLMPort:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    return AnthropicAdapter(api_key=settings.anthropic_api_key, model=settings.anthropic_model)
