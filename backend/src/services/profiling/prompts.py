"""Profiling prompt injector.

The "injector" half of the profiling abstraction: render the system and user
messages from an already-built :class:`ProfilingContext`. File loading and
context retrieval live in ``src.services.profiling.context``; the LLM call and
response parsing live in ``src.services.profiling.llm`` / ``.parser``.

Security
--------
User data is interpolated exclusively through f-strings (compile-time), never
via ``str.format`` on a string that contains user content. Braces or dollar
signs inside an answer therefore survive verbatim and can never be re-read as
format tokens — the same invariant documented in
``prompt_builder.py``.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from src.services.profiling.context import ProfilingContext

PROFILING_TOOL_NAME = "emit_profiling_analysis"

_TOOL_SCHEMA_PATH: Path = Path(__file__).resolve().parent / "profiling_tool.json"


# Q: Should the tool schema be re-read from disk on every request?
# A: No — it is static configuration. Read once and cache.
# Decision: lru_cache mirrors the questionnaire loader for consistency.
@lru_cache(maxsize=1)
def load_profiling_tool_schema() -> dict[str, Any]:
    """Load and cache the Anthropic tool schema for the profiling analysis.

    Raises ``FileNotFoundError`` when ``profiling_tool.json`` is missing — a
    deploy error that should fail fast.
    """
    resolved = _TOOL_SCHEMA_PATH.resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"profiling_tool.json not found at {resolved}")
    with resolved.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def build_system_prompt(ctx: ProfilingContext) -> str:
    """Build the *system* role message for the profiling analysis.

    Interpolates ``ctx.company_name`` and ``ctx.module_label`` via f-strings.
    """
    # Q: Why interpolate user data with f-strings here instead of .format()?
    # A: f-strings are compile-time: braces in `company_name` are literal text
    #    and cannot be interpreted as format tokens.
    # Decision: Keep the static instruction text and the interpolated values in
    #    one f-string chain — no template file, no second format pass.
    company = ctx.company_name or "la empresa"
    module = ctx.module_label or "No se especificó un módulo de perfilamiento"
    return (
        "Eres un consultor experto en sistemas de gestión y normas ISO "
        "(ISO 9001, ISO 14001, ISO 45001) y en la normativa colombiana aplicable "
        "(Decreto 1072 de 2015, Resolución 0312 de 2019).\n\n"
        f"Analizas el perfilamiento de {company}. {module}. Recibes el "
        "contexto completo de una sola vez: todas las respuestas del "
        "perfilamiento y los puntos de dolor (pain points) registrados por el "
        "auditor. No hay fragmentación ni información parcial.\n\n"
        "Tu tarea es analizar conjuntamente las respuestas del perfilamiento y "
        "los puntos de dolor del auditor, razonar cuáles son los puntos de dolor "
        "más importantes (los de mayor impacto en el sistema de gestión y en el "
        "negocio) y traducirlos en un diagnóstico accionable. Fundamenta cada "
        "conclusión en la evidencia de las respuestas; no inventes datos que no "
        "estén en el contexto.\n\n"
        "Responde ÚNICAMENTE con la llamada a la herramienta "
        f"`{PROFILING_TOOL_NAME}`. No incluyas texto fuera de la llamada, ni "
        "explicaciones, ni markdown adicional en la respuesta."
    )


def build_user_prompt(ctx: ProfilingContext) -> str:
    """Build the *user* role message with the labeled Q&A and pain points.

    The answer block is assembled with f-strings only; no ``.format()`` is ever
    applied to user content.
    """
    # Q: How is the Q&A block rendered so user braces stay literal?
    # A: One f-string per line, mirroring build_shared_context.
    # Decision: Never call .format() on any string that contains user data.
    lines: list[str] = [
        f"Empresa: {ctx.company_name or '—'}",
        ctx.module_label or "Módulo: no especificado",
        "",
        "Respuestas del perfilamiento:",
    ]
    if ctx.qa:
        lines.extend(f"- {label}: {answer}" for label, answer in ctx.qa)
    else:
        lines.append("- (sin respuestas registradas)")

    lines.append("")
    if ctx.pain_points:
        lines.append(f"Puntos de dolor del auditor: {ctx.pain_points}")
    else:
        lines.append("Puntos de dolor del auditor: no se registraron puntos de dolor.")

    lines.append("")
    lines.append(
        "Analiza el contexto y devuelve únicamente la llamada a la herramienta "
        f"`{PROFILING_TOOL_NAME}`."
    )
    return "\n".join(lines)
