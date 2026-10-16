"""Profiling analysis orchestration.

Ties the two halves of the LLM abstraction together for a single, whole-context
call (no chunking):

    context retriever (context.py) → prompt injector (prompts.py)
    → LLM generator (llm.py) → parser (parser.py)

Returns a ``ProfilingResult`` and never persists it — the frontend confirmation
step owns persistence (``PUT /processes/{id}/analysis``).
"""

from __future__ import annotations

from src.adapters.db.process_repository import ProcessRepository
from src.adapters.llm.llm_port import LLMPort
from src.domain.entities.process import Process
from src.domain.entities.profiling import ProfilingResult
from src.services.profiling.context import build_context
from src.services.profiling.llm import generate_analysis
from src.services.profiling.parser import parse_result
from src.services.profiling.prompts import build_system_prompt, build_user_prompt


async def analyze(
    process: Process,
    repo: ProcessRepository,
    llm: LLMPort,
) -> ProfilingResult:
    """Build the context, render prompts, make ONE LLM call, and parse the result."""
    company_name = await repo.get_company_name(process.company_id)
    ctx = build_context(process, company_name)

    system_prompt = build_system_prompt(ctx)
    user_prompt = build_user_prompt(ctx)

    structured = await generate_analysis(system_prompt, user_prompt, llm)
    return parse_result(structured.data)
