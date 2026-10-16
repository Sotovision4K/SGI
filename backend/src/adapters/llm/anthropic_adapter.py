import json
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from fastapi import Depends

from src.config.settings import Settings, get_settings
from src.domain.entities.plan import Task, TaskPriority
from src.adapters.llm.llm_port import LLMPort, SegmentResult, StructuredResult
from src.errors import (
    LLMConnectionError,
    LLMRequestRejectedError,
    LLMServiceError,
    LLMTimeoutError,
    RateLimitError,
    ToolNotEmittedError,
)
# Q: Where do the injection mitigations live now?
# A: In the shared `src.services.sanitizer` module so both this adapter and the
#    new prompt builder reuse them (avoids drift between two filter copies).
# Decision: Import + re-export for backwards compatibility with existing callers
#           and tests that still `from ...anthropic_adapter import sanitize_findings`.
from src.services.sanitizer import (
    INJECTION_PATTERNS as _INJECTION_PATTERNS,
    MAX_FREE_TEXT_LENGTH as _MAX_FREE_TEXT_LENGTH,
    sanitize_findings,
    sanitize_markdown,
)

if TYPE_CHECKING:
    pass


# Q: Why declare __all__ here?
# A: To (a) document the module's public surface and (b) suppress ruff F401 on
#    the deliberately-re-exported sanitizer symbols that existing callers still
#    import from this module (`_INJECTION_PATTERNS`, `_MAX_FREE_TEXT_LENGTH`,
#    `sanitize_findings`, `sanitize_markdown`).
# Decision: List re-exports explicitly so the refactor stays lint-clean without
#           forcing every existing import site to switch to `src.services.sanitizer`.
__all__ = [
    "_INJECTION_PATTERNS",
    "_MAX_FREE_TEXT_LENGTH",
    "sanitize_findings",
    "sanitize_markdown",
    "AnthropicAdapter",
    "get_anthropic_adapter",
    "get_profiling_llm",
]

_PROMPTS_DIR = Path(__file__).parent / "prompts"


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
        from anthropic import AsyncAnthropic
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    def _extract_tool_input(self, response: Any) -> dict[str, Any]:
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "emit_action_plan":
                return block.input
        raise ValueError("LLM did not call emit_action_plan tool")

    async def _create_message(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        tools: list[dict[str, Any]],
        tool_choice: dict[str, Any],
        max_tokens: int,
        timeout_seconds: float,
        context: str,
    ) -> Any:
        """Issue one Messages API call, mapping SDK errors to our taxonomy.

        ``context`` is a short label used in the raised error messages (e.g.
        "segment generation", "structured generation") so logs stay specific.

        # Q: Why the specific exception order here?
        # A: anthropic's exceptions nest: RateLimitError ⊂ APIStatusError ⊂ APIError,
        #    and APITimeoutError/APIConnectionError ⊂ APIError (not APIStatusError).
        #    Catching most-specific-first maps each transient cause to its own
        #    RetryableError subclass; the permanent-4xx branch (M1: BadRequest,
        #    Authentication, PermissionDenied, NotFound, RequestTooLarge,
        #    UnprocessableEntity — all ⊂ APIStatusError) must come BEFORE the
        #    APIStatusError catch so a bad API key or over-context prompt fails
        #    fast as terminal instead of burning ~9 retries, while APIError
        #    remains the final catch-all.
        """
        import anthropic as anthropic_sdk

        try:
            return await self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system_prompt,
                tools=tools,
                tool_choice=tool_choice,
                messages=[{"role": "user", "content": user_prompt}],
                timeout=timeout_seconds,
            )
        except anthropic_sdk.RateLimitError as exc:
            raise RateLimitError(f"LLM rate-limited during {context}") from exc
        except anthropic_sdk.APITimeoutError as exc:
            raise LLMTimeoutError(f"LLM timed out during {context}") from exc
        except anthropic_sdk.APIConnectionError as exc:
            raise LLMConnectionError(f"LLM connection error during {context}") from exc
        except (
            anthropic_sdk.BadRequestError,
            anthropic_sdk.AuthenticationError,
            anthropic_sdk.PermissionDeniedError,
            anthropic_sdk.NotFoundError,
            anthropic_sdk.RequestTooLargeError,
            anthropic_sdk.UnprocessableEntityError,
        ) as exc:
            # Permanent 4xx — retrying the identical request cannot succeed.
            raise LLMRequestRejectedError(f"LLM rejected the {context} request") from exc
        except anthropic_sdk.APIStatusError as exc:
            # Remaining status errors (5xx: InternalServerError, Overloaded, …)
            # stay retryable.
            raise LLMServiceError(f"LLM service error during {context}") from exc
        except anthropic_sdk.APIError as exc:
            raise LLMServiceError(f"LLM API error during {context}") from exc

    async def generate_segment(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        max_tokens: int = 4096,
        timeout_seconds: float = 180.0,
    ) -> SegmentResult:
        """Generate a single plan segment (bucket) via tool-use.

        Returns the segment's summary + tasks plus usage/latency for the audit
        log. Maps SDK transport errors to ``RetryableError`` subclasses,
        permanent 4xx rejections to ``LLMRequestRejectedError`` (terminal,
        M1), and a missing tool call to ``ToolNotEmittedError`` (retryable),
        so the worker's tenacity → SQS-redelivery → DLQ ladder can
        distinguish transient from permanent failure.
        """
        import time

        tool_schema = _load_tool_schema()
        started = time.monotonic()

        response = await self._create_message(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tools=[tool_schema],
            tool_choice={"type": "tool", "name": "emit_action_plan"},
            max_tokens=max_tokens,
            timeout_seconds=timeout_seconds,
            context="segment generation",
        )

        latency_ms = int((time.monotonic() - started) * 1000)

        try:
            tool_input = self._extract_tool_input(response)
        except ValueError as exc:
            raise ToolNotEmittedError("LLM did not call emit_action_plan tool") from exc

        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", 0) or 0
        output_tokens = getattr(usage, "output_tokens", 0) or 0

        return SegmentResult(
            # Planner contract (tasks only): the tool schema no longer asks
            # for a narrative summary, so summary_md stays at its "" default —
            # even a stray summary_md in the tool input is ignored.
            tasks=self._tasks_from_input(tool_input),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
        )

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
        """Generic single-call structured output via tool-use.

        Used by the profiling analysis: the whole context is sent in one call
        (no segmentation) and the tool input is parsed by the caller. Maps SDK
        errors exactly like ``generate_segment`` (retryable vs terminal).
        """
        import time

        started = time.monotonic()

        response = await self._create_message(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            tools=[tool_schema],
            tool_choice={"type": "tool", "name": tool_name},
            max_tokens=max_tokens,
            timeout_seconds=timeout_seconds,
            context="structured generation",
        )

        latency_ms = int((time.monotonic() - started) * 1000)

        tool_input: dict[str, Any] | None = None
        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == tool_name:
                tool_input = block.input
                break
        if tool_input is None:
            raise ToolNotEmittedError(f"LLM did not call {tool_name} tool")

        usage = getattr(response, "usage", None)
        return StructuredResult(
            data=tool_input,
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            latency_ms=latency_ms,
        )

    def _tasks_from_input(
        self, tool_input: dict[str, Any], plan_id: uuid.UUID | None = None
    ) -> list[Task]:
        """Build the ``Task`` list from a raw tool-use input.

        # Q: Why is `plan_id` a parameter instead of always generating a new one?
        # A: Callers that already know the plan's id can pass it so the tasks
        #    reference it; ``generate_segment`` leaves it defaulted (a
        #    placeholder id the worker re-stamps during the merge). The id is
        #    never the source of truth — it's overwritten when the plan is
        #    persisted.
        """
        pid = plan_id or uuid.uuid4()
        tasks: list[Task] = []
        for index, raw_task in enumerate(tool_input.get("tasks", [])):
            tasks.append(
                Task(
                    id=uuid.uuid4(),
                    plan_id=pid,
                    title=raw_task.get("title", "").strip()[:200],
                    description=sanitize_markdown(raw_task.get("description", "").strip()),
                    priority=_priority_value(raw_task.get("priority", "medium")),
                    estimated_effort=raw_task.get("estimated_effort", "").strip()[:100],
                    owner_role=raw_task.get("owner_role", "").strip()[:100],
                    sort_order=index,
                    require_document=bool(raw_task.get("require_document", False)),
                    document_title=(
                        sanitize_markdown(raw_task["document_title"])[:200]
                        if raw_task.get("document_title")
                        else None
                    ),
                )
            )
        return tasks


def get_anthropic_adapter(settings: Settings = Depends(get_settings)) -> LLMPort:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    return AnthropicAdapter(api_key=settings.anthropic_api_key, model=settings.anthropic_model)


def get_profiling_llm(settings: Settings = Depends(get_settings)) -> LLMPort:
    """LLM adapter for the profiling analysis (dedicated, newer model).

    Uses ``settings.profiling_model`` (default ``claude-sonnet-5-5``) so the
    profiling endpoint is independent from the plan-generation model.
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    return AnthropicAdapter(api_key=settings.anthropic_api_key, model=settings.profiling_model)
