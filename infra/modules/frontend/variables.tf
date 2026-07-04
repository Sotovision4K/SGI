variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "cert-app"
}

variable "enable_cloudfront" {
  description = "Enable CloudFront distribution"
  type        = bool
  default     = true
}

# aws_region, cognito_user_pool_id, and cognito_web_client_id removed —
# SSM parameters now live in the Cognito module (data origin).