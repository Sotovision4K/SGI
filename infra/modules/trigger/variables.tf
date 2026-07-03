variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "cert-app"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "python3.12"
}

variable "lambda_zip_path" {
  description = "Path to the Lambda deployment package (function.zip)"
  type        = string
  default     = "function.zip"
}

variable "database_url" {
  description = "Database connection URL"
  type        = string
  sensitive   = true
}
