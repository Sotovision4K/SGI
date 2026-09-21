import { tool } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// ─────────────────────────────────────────────────────────────────────────────
// plan-generation-smoke — end-to-end async plan-generation smoke test.
//
// Runs the full Stage-C smoke #1 flow against the deployed stack:
//
//   authenticate (Cognito) → POST /generate-plan (202)
//     → poll GET /plan-generation/status until terminal
//     → GET /plan → validate → report diagnostics
//
// Auth resolution (same as enqueue-plan-test.ts, plus a dotenv loader so the
// tool works without manually sourcing the repo's `.env`):
//
//   1. SGI_ACCESS_TOKEN       — pre-obtained access token (if not expired)
//   2. COGNITO_REFRESH_TOKEN  — 30-day refresh token → REFRESH_TOKEN_AUTH
//      + COGNITO_CLIENT_ID      (the web client is OIDC-only: USER_PASSWORD_AUTH
//      + COGNITO_REGION          and ADMIN_USER_PASSWORD_AUTH are NOT enabled)
//
// It flags the known production failure modes (see `diagnostics` in the result):
//   - empty-tasks    (max_tokens=1500 too low → LLM returns summary but no tasks)
//   - stuck-running  (Lambda 120s timeout vs ~30-90s segment latency → redelivery)
//   - job-failed     (e.g. plan_persist_failed, segment_generation_failed)
// ─────────────────────────────────────────────────────────────────────────────

type InitiateAuthResponse = {
  AuthenticationResult?: {
    AccessToken?: string
    IdToken?: string
    RefreshToken?: string
    ExpiresIn?: number
  }
  __type?: string
  message?: string
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d+$/
const POLL_INTERVAL_MS = 4000

// ── dotenv loader ────────────────────────────────────────────────────────────
// Loads the repo-root `.env` (KEY=VALUE lines; skips blank/comment lines) so the
// tool works without `source .env`. Never overrides an already-set env var.
function loadDotEnv(rootDir: string): void {
  const path = join(rootDir, ".env")
  if (!existsSync(path)) return
  let text: string
  try {
    text = readFileSync(path, "utf-8")
  } catch {
    return
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && !(key in process.env)) process.env[key] = value
  }
}

function assertSafeBaseUrl(urlStr: string): URL {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new Error(`Invalid base URL: ${urlStr}`)
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname)
  // Never send the bearer token to an arbitrary non-HTTPS host.
  if (!isLoopback && url.protocol !== "https:") {
    throw new Error("Non-local API base URL must use HTTPS")
  }
  const allowed = (process.env.SGI_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
  if (!isLoopback && allowed.length > 0 && !allowed.includes(url.hostname)) {
    throw new Error(`Host ${url.hostname} is not in SGI_ALLOWED_HOSTS`)
  }
  return url
}

function resolveBaseUrl(override?: string): string {
  const raw = (override || process.env.SGI_API_BASE_URL || "http://localhost:8000/v1").replace(/\/+$/, "")
  return assertSafeBaseUrl(raw).toString().replace(/\/+$/, "")
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  region: string,
): Promise<string> {
  if (!REGION_RE.test(region)) {
    throw new Error(`Invalid AWS region: ${region}`)
  }
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  })
  const data = (await res.json()) as InitiateAuthResponse
  if (!res.ok || !data.AuthenticationResult?.AccessToken) {
    throw new Error(
      `Cognito token refresh failed (${data.__type ?? res.status}): ${data.message ?? "no token returned"}`,
    )
  }
  return data.AuthenticationResult.AccessToken
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isExpired(token: string): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload) return true
  if (typeof payload.exp !== "number") return false
  return payload.exp * 1000 < Date.now() + 30_000
}

async function resolveAccessToken(): Promise<string> {
  const direct = process.env.SGI_ACCESS_TOKEN
  if (direct && !isExpired(direct)) return direct

  const refreshToken = process.env.COGNITO_REFRESH_TOKEN
  const clientId = process.env.COGNITO_CLIENT_ID
  const region = process.env.COGNITO_REGION
  if (refreshToken && clientId && region) {
    return refreshAccessToken(refreshToken, clientId, region)
  }

  if (direct) {
    throw new Error(
      "SGI_ACCESS_TOKEN is expired and no COGNITO_REFRESH_TOKEN is configured to refresh it.",
    )
  }
  throw new Error(
    "No auth configured. Set SGI_ACCESS_TOKEN, or COGNITO_REFRESH_TOKEN + COGNITO_CLIENT_ID + COGNITO_REGION (or a repo-root .env with these).",
  )
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function summarizeSegments(
  segments: Record<string, { status?: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!segments) return out
  for (const [k, v] of Object.entries(segments)) {
    out[k] = (v && typeof v === "object" ? v.status : undefined) ?? "?"
  }
  return out
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default tool({
  description:
    "End-to-end plan-generation smoke test: authenticate against Cognito, enqueue generate-plan, poll job status, then fetch and validate the plan. Reads credentials from env or a repo-root .env.",
  args: {
    processId: tool.schema
      .string()
      .describe("Process UUID to run the smoke test against (must have findings saved)"),
    baseUrl: tool.schema
      .string()
      .optional()
      .describe("API base URL including the /v1 prefix (defaults to SGI_API_BASE_URL)"),
  },
  async execute(args, context) {
    const root = context?.worktree || context?.directory || process.cwd()
    loadDotEnv(root)

    const processId = (args.processId ?? "").trim()
    if (!processId) {
      return { error: "processId is required" }
    }

    let baseUrl: string
    let accessToken: string
    try {
      baseUrl = resolveBaseUrl(args.baseUrl)
      accessToken = await resolveAccessToken()
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    }
    const timeoutMs = Number(process.env.SGI_SMOKE_TIMEOUT_SECONDS ?? "300") * 1000

    // ── 1. Enqueue ────────────────────────────────────────────────────────────
    const enq = await fetch(`${baseUrl}/processes/${processId}/generate-plan`, {
      method: "POST",
      redirect: "manual",
      headers,
    })
    const enqBody = await safeJson(enq)

    if (enq.status !== 202) {
      const hint =
        enq.status === 400
          ? "findings missing (complete the diagnosis first)"
          : enq.status === 429
            ? "generation cap reached (3 per process)"
            : enq.status === 503
              ? "queue unavailable"
              : undefined
      return {
        step: "enqueue",
        status: enq.status,
        expected: 202,
        body: enqBody,
        hint,
      }
    }

    // ── 2. Poll status ───────────────────────────────────────────────────────
    const started = Date.now()
    const timeline: Array<{ t: number; status: string; segments: Record<string, string> }> = []
    let final: any = null
    while (Date.now() - started < timeoutMs) {
      const s = await fetch(`${baseUrl}/processes/${processId}/plan-generation/status`, { headers })
      const d = await safeJson(s)
      const status = d?.status
      timeline.push({
        t: Math.round((Date.now() - started) / 1000),
        status,
        segments: summarizeSegments(d?.segments),
      })
      if (status === "completed" || status === "failed") {
        final = d
        break
      }
      await sleep(POLL_INTERVAL_MS)
    }

    // ── 3. Fetch & validate the plan ─────────────────────────────────────────
    const p = await fetch(`${baseUrl}/processes/${processId}/plan`, { headers })
    const plan = await safeJson(p)
    const taskCount = Array.isArray(plan?.tasks) ? plan.tasks.length : 0

    // ── 4. Diagnostics ───────────────────────────────────────────────────────
    const diagnostics: string[] = []
    if (!final) {
      diagnostics.push(
        "stuck-running: job did not reach a terminal state within the poll window (possible Lambda 120s timeout + SQS redelivery loop)",
      )
    } else if (final.status === "failed") {
      diagnostics.push(`job-failed: ${final.error ?? "unknown error"}`)
    }
    if (p.status === 200 && taskCount === 0) {
      diagnostics.push(
        "empty-tasks: plan persisted with 0 tasks (segment max_tokens too low — LLM exhausts the budget on the summary)",
      )
    }

    return {
      jobId: enqBody?.job_id,
      enqueueStatus: enq.status,
      finalStatus: final?.status ?? "still-running",
      finalError: final?.error ?? null,
      finalSegments: summarizeSegments(final?.segments),
      plan: {
        status: p.status,
        hasSummary: typeof plan?.summary_md === "string" && plan.summary_md.length > 0,
        taskCount,
      },
      diagnostics,
      timeline,
    }
  },
})
