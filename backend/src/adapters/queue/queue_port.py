from typing import Protocol, runtime_checkable
from uuid import UUID


@runtime_checkable
class QueuePort(Protocol):
    """Port for enqueuing asynchronous work.

    The only operation the plan-generation pipeline needs today is enqueuing a
    single generation job. Keeping this behind a protocol lets tests inject a
    fake (no AWS dependency) and lets us swap the transport later.
    """

    async def enqueue_plan_generation(
        self, process_id: UUID, consultant_id: UUID
    ) -> None:
        """Enqueue a generation job for a process, sealing ownership into the message."""
        ...
