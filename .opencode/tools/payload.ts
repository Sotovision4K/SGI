import { tool } from "@opencode-ai/plugin"

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE"

type EndpointSpec = {
  method: HttpMethod
  path: string
  description: string
  expectedStatus: number
  exampleBody?: Record<string, unknown>
}

type ParsedArguments = {
  functionName: string
  positionalArg?: string
  body?: Record<string, unknown>
}

const endpointCatalog: Record<string, EndpointSpec> = {
  health: {
    method: "GET",
    path: "/health",
    description: "Health check endpoint",
    expectedStatus: 200,
  },
  create_company: {
    method: "POST",
    path: "/companies",
    description: "Create a company",
    expectedStatus: 201,
    exampleBody: {
      name: "Acme Consultores",
      business_type: "services",
    },
  },
  get_company: {
    method: "GET",
    path: "/companies/$1",
    description: "Fetch one company",
    expectedStatus: 200,
  },
  create_process: {
    method: "POST",
    path: "/processes",
    description: "Create a process",
    expectedStatus: 201,
    exampleBody: {
      company_id: "00000000-0000-0000-0000-000000000000",
      iso_standard: "iso9001",
    },
  },
  get_process: {
    method: "GET",
    path: "/processes/$1",
    description: "Fetch one process",
    expectedStatus: 200,
  },
  upsert_findings: {
    method: "PUT",
    path: "/processes/$1/findings",
    description: "Persist diagnostic findings",
    expectedStatus: 200,
    exampleBody: {
      answers: {
        q1: "yes",
        q2: "partial",
      },
      free_text: "Initial assessment from the consultant.",
    },
  },
  generate_plan: {
    method: "POST",
    path: "/processes/$1/generate-plan",
    description: "Generate a corrective action plan",
    expectedStatus: 200,
  },
  get_questionnaire: {
    method: "GET",
    path: "/questionnaires/$1",
    description: "Fetch the questionnaire for an ISO standard",
    expectedStatus: 200,
  },
}

function parseArguments(rawArguments?: string): ParsedArguments {
  const normalized = (rawArguments ?? "").trim()
  if (!normalized) {
    return { functionName: "help" }
  }

  const match = normalized.match(/^(\S+)(?:\s+(.+))?$/s)
  const functionName = match?.[1] ?? normalized
  const remainder = match?.[2] ?? ""

  let body: Record<string, unknown> | undefined
  let positionalArg: string | undefined

  if (remainder) {
    const trimmed = remainder.trim()
    if (trimmed.startsWith("{")) {
      try {
        body = JSON.parse(trimmed) as Record<string, unknown>
      } catch {
        body = { raw: trimmed }
      }
    } else {
      positionalArg = trimmed
    }
  }

  return { functionName, positionalArg, body }
}

function buildPath(pathTemplate: string, positionalArg?: string): string {
  if (!positionalArg) {
    return pathTemplate.replace(/\$1/g, "<id>")
  }

  return pathTemplate.replace(/\$1/g, positionalArg)
}

function getEndpointSpec(functionName: string): EndpointSpec | undefined {
  const normalizedName = functionName.toLowerCase().trim()
  return endpointCatalog[normalizedName]
}

export default tool({
  description: "Build sample payloads, simulations, and HTTP requests for supported backend endpoints",
  args: {
    arguments: tool.schema.string().describe("Arguments in the form <functionName> [<bodyJsonOrId>]"),
    baseUrl: tool.schema.string().describe("Base URL for the generated HTTP request").default("http://localhost:8000/v1"),
  },
  async execute(args) {
    const parsedArguments = parseArguments(args.arguments ?? process.env.ARGUMENTS)
    const endpoint = getEndpointSpec(parsedArguments.functionName)

    if (!endpoint) {
      return {
        message: "No matching endpoint found. Available options:",
        availableEndpoints: Object.keys(endpointCatalog),
      }
    }

    const resolvedBody = parsedArguments.body ?? endpoint.exampleBody
    const requestBody = resolvedBody ? JSON.stringify(resolvedBody) : undefined

    return {
      functionName: parsedArguments.functionName,
      payload: resolvedBody ?? null,
      simulation: {
        endpoint: buildPath(endpoint.path, parsedArguments.positionalArg),
        description: endpoint.description,
        expectedStatus: endpoint.expectedStatus,
      },
      httpRequest: {
        method: endpoint.method,
        url: `${args.baseUrl}${buildPath(endpoint.path, parsedArguments.positionalArg)}`,
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      },
    }
  },
})
