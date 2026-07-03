variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository (owner/repo)"
  type        = string
  default     = ""
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "cors_allow_origins" {
  description = "Comma-separated CORS allowed origins"
  type        = string
  default     = ""
}

variable "supabase_database_url" {
  description = "Supabase database connection URL"
  type        = string
  sensitive   = true
}

provider "aws" {
  region = var.aws_region
}

# ── Module order reflects dependency direction: frontend → cognito → backend ──

module "frontend" {
  source = "../../modules/frontend"

  environment  = var.environment
  project_name = var.project_name
  # No Cognito dependencies — SSM parameters moved to Cognito module.
}

module "trigger" {
  source = "../../modules/trigger"

  environment  = var.environment
  project_name = var.project_name

  database_url = var.supabase_database_url
}

module "cognito" {
  source = "../../modules/cognito"

  environment  = var.environment
  project_name = var.project_name

  # Use dynamic CloudFront domain for callbacks; fall back to localhost on first apply
  callback_urls = module.frontend.cloudfront_domain != "" ? [
    "https://${module.frontend.cloudfront_domain}/auth/signin",
    "https://${module.frontend.cloudfront_domain}/"
  ] : [
    "http://localhost:5173/auth/signin",
    "http://localhost:5173/"
  ]
  logout_urls = module.frontend.cloudfront_domain != "" ? [
    "https://${module.frontend.cloudfront_domain}/auth/signin"
  ] : [
    "http://localhost:5173/auth/signin"
  ]

  post_signup_trigger_arn = module.trigger.post_signup_lambda_arn
}

module "backend" {
  source = "../../modules/backend"

  environment  = var.environment
  project_name = var.project_name

  database_url          = var.supabase_database_url
  anthropic_api_key     = var.anthropic_api_key
  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_client_id     = module.cognito.web_client_id
  cognito_region        = var.aws_region
  cognito_jwks_url      = "https://cognito-idp.${var.aws_region}.amazonaws.com/${module.cognito.user_pool_id}/.well-known/jwks.json"
  cors_allow_origins    = var.cors_allow_origins != "" ? var.cors_allow_origins : (module.frontend.cloudfront_domain != "" ? "https://${module.frontend.cloudfront_domain}" : "http://localhost:5173,http://localhost:3000")
}

module "iam" {
  source = "../../modules/iam"

  environment  = var.environment
  project_name = var.project_name
  repository   = var.github_repository
}

# ── Standalone SSM parameters (circuit-breaker pattern) ──────────────
# These live here (not in individual modules) to avoid circular dependencies:
# - cloudfront params: frontend module owns CloudFront, but storing SSM
#   inside it would require importing cognito IDs (the old cycle).
# - api_endpoint: putting this in Cognito would create cognito → backend
#   and backend → cognito (a real cycle).
# - ci/cd consumers (frontend.yml) read these via ssm:GetParameter.

resource "aws_ssm_parameter" "cloudfront_domain" {
  name        = "/${var.project_name}/${var.environment}/cloudfront/domain"
  type        = "String"
  value       = module.frontend.cloudfront_domain
  description = "CloudFront domain for ${var.environment}"
  tags        = { Environment = var.environment }
}

resource "aws_ssm_parameter" "cloudfront_distribution_id" {
  name        = "/${var.project_name}/${var.environment}/cloudfront/distribution-id"
  type        = "String"
  value       = module.frontend.cloudfront_distribution_id
  description = "CloudFront distribution ID for ${var.environment} (used by CI/CD invalidation)"
  tags        = { Environment = var.environment }
}

resource "aws_ssm_parameter" "api_endpoint" {
  name        = "/${var.project_name}/${var.environment}/api/endpoint"
  type        = "String"
  value       = module.backend.api_endpoint
  description = "API Gateway endpoint for ${var.environment}"
  tags        = { Environment = var.environment }
}
