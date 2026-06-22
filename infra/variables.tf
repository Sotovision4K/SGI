variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "cert-app"
}

variable "anthropic_api_key" {
  description = "Anthropic API key for LLM features (sensitive)"
  type        = string
  sensitive   = true
  default     = ""
}