"""Error taxonomy for the ISO action-plan generation pipeline.

The taxonomy splits failures into two fundamental categories:

- ``RetryableError``: a transient condition (rate limit, timeout, connection
  drop, LLM service hiccup) where retrying the same request may succeed. These
  are retried a bounded number of times and then routed to a dead-letter queue.
- ``TerminalError``: a permanent condition (malformed or rejected LLM output,
  missing findings) that will never succeed on retry. These fail fast with no
  retry.

A few domain-specific failures (segment generation, queue enqueue, audit-log
write, and generation-limit) extend the base directly because they are handled
by dedicated code paths rather than the generic retry/terminal policy.
"""


class PlanGenerationError(Exception):
    """Base error for the action-plan generation pipeline.

    Subclasses split into ``RetryableError`` (transient → retry then DLQ) and
    ``TerminalError`` (permanent → fail fast, no retry). Other subclasses extend
    this base directly for dedicated handling.
    """


class RetryableError(PlanGenerationError):
    """Transient failure that may succeed on retry."""


class RateLimitError(RetryableError):
    """The LLM provider returned a rate-limit (HTTP 429) response."""


class LLMServiceError(RetryableError):
    """The LLM provider returned an unexpected 5xx/4xx service error."""


class LLMTimeoutError(RetryableError):
    """The LLM request timed out."""


class LLMConnectionError(RetryableError):
    """A network/connection error occurred while calling the LLM."""


class ToolNotEmittedError(RetryableError):
    """The LLM did not emit the expected tool call."""


class TerminalError(PlanGenerationError):
    """Permanent failure that must not be retried."""


class InvalidResponseError(TerminalError):
    """The LLM response is structurally invalid."""


class ResponseRejectedError(TerminalError):
    """The LLM response failed validation and was rejected."""


class MissingFindingsError(TerminalError):
    """No findings are available to drive plan generation."""


class SegmentGenerationError(PlanGenerationError):
    """A single segment of the plan failed to generate."""


class QueueEnqueueError(PlanGenerationError):
    """A generation job could not be enqueued."""


class AuditLogWriteError(PlanGenerationError):
    """The LLM audit log could not be written."""


class GenerationLimitError(PlanGenerationError):
    """A generation limit was exceeded."""
