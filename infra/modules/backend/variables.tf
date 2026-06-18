variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "cert-app"
}

variable "subnet_ids" {
  description = "Subnet IDs for Lambda"
  type        = list(string)
  default     = []
}

variable "memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "python3.12"
}