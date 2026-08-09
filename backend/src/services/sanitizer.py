"""Shared prompt-injection sanitizer.

Extracted from `src.adapters.llm.anthropic_adapter` so both the Anthropic
adapter and the new prompt builder reuse the same mitigations. Drift between
the two consumers would let an attacker pick the weaker of the two paths.

Public API:
- ``INJECTION_PATTERNS``   — ordered list of regex patterns to strip
- ``MAX_FREE_TEXT_LENGTH`` — hard cap on free-text field length
- ``sanitize_findings(findings, pre_diagnosis=None)``  — sanitize a findings dict
- ``sanitize_single_answer(text)``                     — sanitize one answer string
- ``sanitize_markdown(md)``                             — sanitize LLM output markdown
- ``_normalize_text(text)``                             — Unicode pre-processing helper
"""

import re
import unicodedata

# Q: Where should the max free-text length be defined?
# A: As a module-level constant so consumers (and tests) can reference it.
# Decision: Public so the prompt builder can reuse the same bound.
MAX_FREE_TEXT_LENGTH = 5000


# Q: Which Unicode characters are invisible but can alter parser behaviour?
# A: Zero-width joins/spaces (U+200B-200F, U+2060-2064, U+FEFF) and line/word
#    separators (U+2028-202F) can hide injection phrases from regex matching.
# Decision: Strip them BEFORE running the pattern list.
_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200f\u2028-\u202f\u2060-\u2064\uFEFF]")

# Q: Can bidi-override characters (used in "Trojan Source" attacks) reorder
#    visible text to disguise an instruction?
# A: Yes — U+202A-U+202E force LTR/RTL embedding/override. Strip them outright.
# Decision: Remove rather than escape — we never want them in user data.
_BIDI_OVERRIDE_RE = re.compile(r"[\u202a-\u202e]")


def _normalize_text(text: str) -> str:
    """Strip zero-width and bidi override chars, normalize Unicode.

    Q: Why NFC and not NFKC?
    A: NFC composes characters but preserves meaning; NFKC would also fold
       compatibility forms (e.g. ligatures) which can lose information.
    Decision: NFC is the safe default for cosmetic comparison + pattern matching.
    """
    text = _ZERO_WIDTH_RE.sub("", text)
    text = _BIDI_OVERRIDE_RE.sub("", text)
    text = unicodedata.normalize("NFC", text)
    return text


# Q: What sequences signal a prompt-injection attempt?
# A: Phrases that tell the model to ignore its instructions, impersonate a
#    system role, or use coded delimiters (<<<, """, ---) to splice blocks.
# Decision: Match broader→narrower so a general catch runs first.
# Q: Why add Anthropic-specific tokens here?
# A: A user string starting with "Human:" / "Assistant:" or containing
#    <function_calls> tags can splice fake turns or tool calls into the
#    Claude conversation. Strip them before they reach the API.
# Decision: Public list so other adapters (e.g. OpenAI) can opt-in later.
INJECTION_PATTERNS = [
    # --- Spanish injection phrases ---
    r"(?i)\bignor[ae]\s+(?:tod[ao]s?\s+)?(?:las?\s+)?instrucciones",
    r"(?i)\bignor[ae]\s+(?:todo|lo\s+anterior|lo\s+previo)\b",
    r"(?i)\beres\s+(?:ahora\s+)?un\s+",
    r"(?i)\btu\s+nuevo\s+objetivo",
    r"(?i)\bolvida\s+(?:todo\s+)?(?:lo\s+anterior|las?\s+instrucciones)",
    r"(?i)\breinicia\s+(?:y\s+)?(?:ahora\s+)?eres?",
    r"(?i)\bno\s+eres\s+un\s+consultor",
    r"(?i)\bno\s+sigas?\s+las?\s+reglas?\b",
    r"(?i)\bresponde\s+como\s+si\s+fueras?\b",
    r"(?i)\bsoy\s+tu\s+creador\b",
    r"(?i)\bmodo\s+desarrollador\b",
    r"(?i)\bpor\s+encima\s+de\s+todo\b",
    r"(?i)\bprimero\s+y\s+principal\b",
    r"(?i)\binstrucción\s+del\s+sistema\b",
    r"(?i)\bmensaje\s+del\s+sistema\b",
    r"(?i)\bdile?\s+al\s+usuario\b",
    r"(?i)\bdi\s+lo\s+siguiente\b",
    r"(?i)\bpuntúa\s+10/10\b",
    r"(?i)\bcertifica\s+automáticamente\b",
    # --- English injection phrases ---
    r"(?i)\bignore\s+(?:all\s+)?(?:previous\s+)?instructions",
    r"(?i)you\s+are\s+now\s+a\s+",
    # --- System-role splicing markers ---
    r"(?i)\[SYSTEM\]",
    r"(?i)\[INST\]",
    r"(?i)<\|im_start\|>",
    r"(?i)<\|im_end\|>",
    # --- Coded-delimiter block splicing ---
    r"(?i)^---\s*$",
    r"(?i)^\"\"\"\s*$",
    r"(?i)\<\<\<",
    r"(?i)\>\>\>",
    r"(?i)\bBEGIN\b",
    r"(?i)\bEND\b",
    # --- Anthropic-specific turn / tool tokens ---
    # Q: Can a user inject Claude's own turn markers to start a fake turn?
    # A: Yes — "Human:" / "Assistant:" prefix a new message segment.
    # Decision: Replace the token only; trailing text (e.g. "do this") is kept
    #           so legitimate data isn't wholesale deleted.
    r"(?i)\bHuman:\s*",
    r"(?i)\bAssistant:\s*",
    # Q: Can user text fabricate tool-call tags that Claude interprets?
    # A: Yes — <function_calls>/<invoke> wrap forged tool invocations.
    # Decision: Strip the structural tags; inner text is harmless without them.
    r"(?i)<function_calls>",
    r"(?i)</function_calls>",
    r"(?i)<invoke\b",
    r"(?i)</invoke>",
]

# Pre-compile for performance — each pattern is run against every text field.
_COMPILED_PATTERNS = [re.compile(p) for p in INJECTION_PATTERNS]


def _apply_patterns(text: str) -> str:
    """Replace every matching injection pattern in ``text`` with ``[FILTERED]``."""
    for pattern in _COMPILED_PATTERNS:
        text = pattern.sub("[FILTERED]", text)
    return text


def sanitize_single_answer(text: str) -> str:
    """Sanitize one free-text answer string.

    Q: Why a per-string helper in addition to ``sanitize_findings``?
    A: The prompt builder assembles messages one field at a time and does not
       want to wrap every value in a findings dict just to clean it.
    Decision: Expose the core pipeline (normalize → scrub → truncate) as a
              standalone public function.

    Note: single answers are NOT length-truncated — only free_text is, to
    preserve legibility of short answer fields like company-size buckets.
    """
    if not isinstance(text, str):
        text = str(text)
    text = _normalize_text(text)
    return _apply_patterns(text)


def sanitize_findings(findings: dict, pre_diagnosis: dict | None = None) -> dict:
    """Sanitize user-provided findings and pre-diagnosis before sending to the LLM.

    Returns a dict with 'findings' and optionally 'pre_diagnosis' keys, each cleaned.

    Q: Why normalize+scrub every field individually?
    A: Each answer is an independent attack surface; a malicious phrase in
       ``answers['q2']`` must not be able to rely on ``q1`` being matched first.
    Decision: Run the full pipeline per field — same behaviour as the original
              adapter so the refactor is a behaviour-preserving move.
    """
    result: dict[str, dict] = {"findings": {"answers": {}, "free_text": ""}}

    # Sanitize findings free_text (with truncation)
    # Q: Truncate before or after scrubbing?
    # A: After — so replacement markers don't push us past the cap, but the
    #    cap is enforced on the final string so we never exceed MAX.
    # Decision: Scrub then hard-truncate, matching the original adapter.
    free_text = _normalize_text(str(findings.get("free_text", "")))
    free_text = _apply_patterns(free_text)
    result["findings"]["free_text"] = free_text[:MAX_FREE_TEXT_LENGTH]

    # Sanitize findings answers
    answers = findings.get("answers", {})
    result["findings"]["answers"] = {}
    if isinstance(answers, dict):
        for key, value in answers.items():
            result["findings"]["answers"][key] = sanitize_single_answer(value)

    # Sanitize pre_diagnosis answers
    if pre_diagnosis is not None:
        result["pre_diagnosis"] = {}
        if isinstance(pre_diagnosis, dict):
            for key, value in pre_diagnosis.items():
                result["pre_diagnosis"][key] = sanitize_single_answer(value)

    return result


def sanitize_markdown(md: str) -> str:
    """Sanitize LLM-generated markdown output.

    Removes image syntax, raw HTML tags, and other potentially dangerous content.

    Q: Why keep this function in the sanitizer module rather than the adapter?
    A: It's an output-side mitigation paired with the input-side ones; keeping
       them together makes the security surface a single import.
    Decision: Move alongside ``sanitize_findings`` for discoverability.
    """
    # Remove markdown image syntax: ![alt](url)
    md = re.sub(r'!\[.*?\]\(.*?\)', '[IMAGE REMOVED]', md)
    # Remove raw HTML tags
    md = re.sub(r'<[^>]*>', '', md)
    return md