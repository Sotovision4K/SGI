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

variable "frontend_origin" {
  description = "Frontend origin URL for Cognito callbacks"
  type        = string
  default     = ""
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

module "cognito" {
  source = "../../modules/cognito"

  environment  = var.environment
  project_name = var.project_name

  callback_urls = var.frontend_origin != "" ? ["${var.frontend_origin}/auth/signin", "${var.frontend_origin}/"] : ["http://localhost:5173/auth/signin", "http://localhost:5173/"]
  logout_urls   = var.frontend_origin != "" ? ["${var.frontend_origin}/auth/signin"] : ["http://localhost:5173/auth/signin"]
}

module "frontend" {
  source = "../../modules/frontend"

  environment  = var.environment
  project_name = var.project_name
  aws_region   = var.aws_region

  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_web_client_id = module.cognito.web_client_id
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
  cors_allow_origins    = var.cors_allow_origins != "" ? var.cors_allow_origins : (var.frontend_origin != "" ? var.frontend_origin : "http://localhost:5173,http://localhost:3000")
}

module "iam" {
  source = "../../modules/iam"

  environment  = var.environment
  project_name = var.project_name
  repository   = var.github_repository
}