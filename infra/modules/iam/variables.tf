variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "cert-app"
}

variable "repository" {
  description = "GitHub repository name (owner/repo)"
  type        = string
  default     = ""
}