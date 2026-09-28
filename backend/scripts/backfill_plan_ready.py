"""One-off backfill: mark processes with a saved plan as `plan_ready`.

Context: the deployed Lambda was one commit behind the repo — it saved plans
(`replace_plan`) and completed jobs, but did not transition the process
`in_diagnosis → plan_ready` (added in `a6f2aa8`). A few processes are therefore
stuck: they have a `plans` row yet remain in a pre-plan state.

This script flips any process that (a) has a plan and (b) is still in a
pre-plan state (`in_diagnosis` / `in_progress`) to `plan_ready`, bumping
`updated_at` exactly as `update_process_status` does.

Safe to re-run:
- `completed` processes are never touched (the worker deliberately never
  downgrades a completed process to plan_ready).
- processes without a plan are unaffected.

Usage (run from `backend/` so `get_settings()` finds `.env`):

    python scripts/backfill_plan_ready.py            # dry-run — list affected rows
    python scripts/backfill_plan_ready.py --apply    # actually update
"""

import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config.settings import get_settings


def _sync_database_url(url: str) -> str:
    """Strip the SQLAlchemy asyncpg dialect prefix for a raw psycopg connection.

    postgresql+asyncpg://... → postgresql://...
    """
    if "+" in url and "://" in url:
        scheme, rest = url.split("://", 1)
        if "+" in scheme:
            url = scheme.split("+")[0] + "://" + rest
    return url


SELECT_STUCK = """
    SELECT p.id, p.status, p.updated_at
    FROM processes p
    WHERE p.status IN ('in_diagnosis', 'in_progress')
      AND EXISTS (SELECT 1 FROM plans pl WHERE pl.process_id = p.id)
    ORDER BY p.created_at
"""

UPDATE_STUCK = """
    UPDATE processes p
    SET status = 'plan_ready', updated_at = now()
    WHERE p.status IN ('in_diagnosis', 'in_progress')
      AND EXISTS (SELECT 1 FROM plans pl WHERE pl.process_id = p.id)
"""


def main() -> None:
    apply = "--apply" in sys.argv

    database_url = _sync_database_url(get_settings().database_url)
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(SELECT_STUCK)
            rows = cur.fetchall()

            if not rows:
                print("No stuck processes found — nothing to do.")
                return

            print(
                f"Found {len(rows)} process(es) with a saved plan but not yet plan_ready:\n"
            )
            for pid, status, updated_at in rows:
                print(f"  {pid}  status={status}  updated_at={updated_at}")

            if not apply:
                print("\nDry-run: no changes made. Re-run with --apply to update.")
                return

            cur.execute(UPDATE_STUCK)
            changed = cur.rowcount
        conn.commit()

    print(f"\nApplied: {changed} process(es) set to 'plan_ready'.")


if __name__ == "__main__":
    main()
