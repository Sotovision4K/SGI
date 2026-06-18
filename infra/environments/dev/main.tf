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

provider "aws" {
  region = var.aws_region
}

module "network" {
  source = "../../modules/network"

  environment   = var.environment
  project_name  = var.project_name
  vpc_cidr      = "10.0.0.0/16"
  availability_zones = ["us-east-1a"]
}

module "cognito" {
  source = "../../modules/cognito"

  environment = var.environment
  project_name = var.project_name

  callback_urls = var.frontend_origin != "" ? ["${var.frontend_origin}/"] : ["http://localhost:5173/"]
  logout_urls   = var.frontend_origin != "" ? ["${var.frontend_origin}/auth/signin"] : ["http://localhost:5173/auth/signin"]
}

module "frontend" {
  source = "../../modules/frontend"

  environment  = var.environment
  project_name = var.project_name
  aws_region   = var.aws_region

  cognito_user_pool_id   = module.cognito.user_pool_id
  cognito_web_client_id  = module.cognito.web_client_id
}

module "backend" {
  source = "../../modules/backend"

  environment  = var.environment
  project_name = var.project_name
  subnet_ids   = [module.network.public_subnet_id]
  vpc_id       = module.network.vpc_id
}

module "iam" {
  source = "../../modules/iam"

  environment = var.environment
  project_name = var.project_name
  repository   = var.github_repository
}