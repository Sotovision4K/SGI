"""Profiling LLM generator.

The "generator" half of the profiling abstraction: given an already-built
prompt, call the LLM and return the raw structured output. Owns the tool
wiring (schema + name) but NOT context retrieval — prompt assembly lives in
``src.services.profiling.prompts`` and parsing lives in
``src.services.profiling.parser``.

The adapter already maps provider errors to ``RetryableError``/``TerminalError``,
so this layer adds no error handling of its own.
"""

from __future__ import annotations

from src.adapters.llm.llm_port import LLMPort, StructuredResult
from src.services.profiling.prompts import (
    PROFILING_TOOL_NAME,
    load_profiling_tool_schema,
)


async def generate_analysis(
    system_prompt: str,
    user_prompt: str,
    llm: LLMPort,
) -> StructuredResult:
    """Send the whole profiling context in a single call (no chunking)."""
    return await llm.generate_structured(
        system_prompt,
        user_prompt,
        tool_schema=load_profiling_tool_schema(),
        tool_name=PROFILING_TOOL_NAME,
    )
