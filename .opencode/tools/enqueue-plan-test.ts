import { tool } from "@opencode-ai/plugin"

// ─────────────────────────────────────────────────────────────────────────────
// enqueue-plan-test — Phase 4 test of the async plan-generation enqueue path.
//
// Authenticates against AWS Cognito and POSTs
//   POST {baseUrl}/processes/{process_id}/generate-plan   → expect 202 {job_id}
//
// The SQS event-source mapping is DISABLED during this test, so the enqueued
// message just sits in the queue (never processed) — zero LLM spend, zero DB
// writes. After the call, verify the message landed and then purge it via the
// AWS CLI:
//
//   aws sqs get-queue-attributes \
//     --queue-url <url> --attribute-names ApproximateNumberOfMessages   # → 1
//   aws sqs purge-queue --queue-url <url>
//
// ── Authentication (Cognito) ────────────────────────────────────────────────
// The backend validates a Cognito **access token** (`token_use == "access"`,
// matching `client_id`). This tool NEVER stores or logs secrets. It resolves a
// token in priority order from `process.env` (export these before launching
// opencode):
//
//   1. SGI_ACCESS_TOKEN        — a pre-obtained access token (valid ~1 hour).
//   2. COGNITO_REFRESH_TOKEN   — a 30-day refresh token, exchanged via
//      + COGNITO_CLIENT_ID       REFRESH_TOKEN_AUTH (enabled on the web client
//      + COGNITO_REGION          by default; no Terraform change needed).
//
// The Cognito app client is `generate_secret = false`, so no client secret is
// required for InitiateAuth/REFRESH_TOKEN_AUTH.
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

  // Optional explicit allowlist of API hosts (defense-in-depth against SSRF).
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
    // Log only the error code/message — never the token or any secret.
    throw new Error(
      `Cognito token refresh failed (${data.__type ?? res.status}): ${data.message ?? "no token returned"}`,
    )
  }

  return data.AuthenticationResult.AccessToken
}

// Decode a JWT payload without verifying the signature (verification is the
// backend's job — we only need the `exp` claim to decide whether to refresh).
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

// True if the token is invalid/unparseable or expiring within 30s.
function isExpired(token: string): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload) return true
  if (typeof payload.exp !== "number") return false
  return payload.exp * 1000 < Date.now() + 30_000
}

async function resolveAccessToken(): Promise<string> {
  // Option 1: explicit access token, but only if still valid.
  const direct = process.env.SGI_ACCESS_TOKEN
  if (direct && !isExpired(direct)) return direct

  // Option 2: refresh token → access token (also the self-heal path for an
  // expired SGI_ACCESS_TOKEN).
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
    "No auth configured. Set SGI_ACCESS_TOKEN, or COGNITO_REFRESH_TOKEN + COGNITO_CLIENT_ID + COGNITO_REGION.",
  )
}

export default tool({
  description:
    "Test the async plan-generation enqueue path: authenticate against Cognito and POST /processes/{id}/generate-plan (expect 202). Requires SGI_ACCESS_TOKEN or Cognito refresh credentials in the environment.",
  args: {
    processId: tool.schema.string().describe("Process UUID to enqueue plan generation for"),
    baseUrl: tool.schema
      .string()
      .describe("API base URL including the /v1 prefix (defaults to SGI_API_BASE_URL or localhost)"),
  },
  async execute(args) {
    const processId = args.processId.trim()
    if (!processId) {
      return { error: "processId is required" }
    }

    const baseUrl = resolveBaseUrl(args.baseUrl)
    const accessToken = await resolveAccessToken()

    const url = `${baseUrl}/processes/${processId}/generate-plan`

    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })

    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = await res.text()
    }

    return {
      endpoint: url,
      status: res.status,
      expectedStatus: 202,
      body,
      next: res.status === 202
        ? "Message enqueued. Verify then purge: aws sqs get-queue-attributes --queue-url <url> --attribute-names ApproximateNumberOfMessages && aws sqs purge-queue --queue-url <url>"
        : undefined,
    }
  },
})
