from collections import defaultdict
from time import time
from fastapi import HTTPException, status

_buckets: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(key: str, max_requests: int = 5, window: int = 60) -> None:
    now = time()
    timestamps = _buckets[key]

    while timestamps and timestamps[0] < now - window:
        timestamps.pop(0)

    if len(timestamps) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas solicitudes. Intenta en un minuto.",
        )

    timestamps.append(now)
