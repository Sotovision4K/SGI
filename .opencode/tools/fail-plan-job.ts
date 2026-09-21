import { tool } from "@opencode-ai/plugin"
import { Client } from "pg"

// ─────────────────────────────────────────────────────────────────────────────
// fail-plan-job — cleanup for orphaned plan_jobs rows.
//
// Marks a `plan_jobs` row as `failed` (only if it is currently `queued` or
// `running`), so a process that got left with an orphaned job (e.g. after a
// Phase-4 enqueue test purged its SQS message) can be re-enqueued cleanly.
// Mirrors the backend `ProcessRepository.fail_job` guard (`queued|running`).
//
//   UPDATE plan_jobs
//      SET status = 'failed', error = $2, updated_at = $3
//    WHERE process_id = $1 AND status IN ('queued', 'running')
//
// ── Connection ──────────────────────────────────────────────────────────────
// Reads DATABASE_URL from `process.env`. Export it in your shell before
// launching opencode:
//
//   export DATABASE_URL="postgresql+asyncpg://…"
//
// The URL may be in SQLAlchemy form (`postgresql+asyncpg://…`) — the `+asyncpg`
// dialect is stripped automatically. The connection string is NEVER logged.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function normalizeDbUrl(url: string): string {
  return url.replace(/\+asyncpg/g, "").replace(/\+psycopg/g, "")
}

export default tool({
  description:
    "Mark a plan_jobs row as failed (cleanup for orphaned queued/running jobs so a process can be re-enqueued). Requires DATABASE_URL in the environment.",
  args: {
    processId: tool.schema.string().describe("Process UUID whose job should be marked failed"),
    error: tool.schema
      .string()
      .describe("Short reason recorded in plan_jobs.error (defaults to MANUAL_CLEANUP)"),
  },
  async execute(args) {
    const processId = args.processId.trim()
    if (!UUID_RE.test(processId)) {
      throw new Error(`Invalid processId (must be a UUID): ${processId}`)
    }

    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
      throw new Error(
        "DATABASE_URL is not set. Export it before launching opencode, e.g. from infra/environments/dev/terraform.tfvars (supabase_database_url).",
      )
    }

    const error = (args.error ?? "MANUAL_CLEANUP").trim().slice(0, 200)
    const now = new Date().toISOString()

    const client = new Client({
      connectionString: normalizeDbUrl(dbUrl),
      connectionTimeoutMillis: 10000,
    })

    try {
      await client.connect()
      const result = await client.query(
        `UPDATE plan_jobs
            SET status = 'failed', error = $2, updated_at = $3
          WHERE process_id = $1 AND status IN ('queued', 'running')`,
        [processId, error, now],
      )
      return {
        processId,
        rowsAffected: result.rowCount ?? 0,
        result:
          (result.rowCount ?? 0) > 0
            ? "marked failed — process can be re-enqueued"
            : "no queued/running job found (already failed/completed, or process has no job)",
      }
    } finally {
      await client.end().catch(() => {})
    }
  },
})
