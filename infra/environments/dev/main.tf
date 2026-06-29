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

provider "aws" {
  region = var.aws_region
}

module "network" {
  source = "../../modules/network"

  environment        = var.environment
  project_name       = var.project_name
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

module "cognito" {
  source = "../../modules/cognito"

  environment  = var.environment
  project_name = var.project_name

  callback_urls = var.frontend_origin != "" ? ["${var.frontend_origin}/auth/signin"] : ["http://localhost:5173/auth/signin"]
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
  subnet_ids   = module.network.private_subnet_ids
  vpc_id       = module.network.vpc_id

  database_url          = "postgresql+asyncpg://${module.rds.db_username}:${urlencode(module.rds.db_password)}@${module.rds.db_instance_address}:5432/${module.rds.db_name}"
  anthropic_api_key     = var.anthropic_api_key
  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_client_id     = module.cognito.web_client_id
  cognito_region        = var.aws_region
  cognito_jwks_url      = "https://cognito-idp.${var.aws_region}.amazonaws.com/${module.cognito.user_pool_id}/.well-known/jwks.json"
  cors_allow_origins    = var.cors_allow_origins != "" ? var.cors_allow_origins : (var.frontend_origin != "" ? var.frontend_origin : "http://localhost:5173,http://localhost:3000")
}

module "rds" {
  source = "../../modules/rds"

  environment        = var.environment
  project_name       = var.project_name
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
}

# Ingress rule: allow Lambda SG to reach RDS on 5432 (avoids circular dependency)
resource "aws_security_group_rule" "rds_ingress_lambda" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = module.backend.lambda_security_group_id
  security_group_id        = module.rds.db_security_group_id
  description              = "Allow PostgreSQL from Lambda"
}

module "iam" {
  source = "../../modules/iam"

  environment  = var.environment
  project_name = var.project_name
  repository   = var.github_repository
}