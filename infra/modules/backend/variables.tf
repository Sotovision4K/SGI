variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "cert-app"
}

variable "memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 120
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "python3.12"
}

# ── Lambda environment variables ─────────────────────────────────

variable "database_url" {
  description = "Database connection URL"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^postgresql(\\+asyncpg)?://", var.database_url))
    error_message = "DATABASE_URL must start with postgresql:// or postgresql+asyncpg://"
  }
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
  default     = ""
}

variable "cognito_client_id" {
  description = "Cognito User Pool Client ID"
  type        = string
  default     = ""
}

variable "cognito_region" {
  description = "AWS region for Cognito"
  type        = string
  default     = ""
}

variable "cognito_jwks_url" {
  description = "Cognito JWKS URL"
  type        = string
  default     = ""
}

variable "cors_allow_origins" {
  description = "Comma-separated CORS allowed origins"
  type        = string
  default     = ""
}