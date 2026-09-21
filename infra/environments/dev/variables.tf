variable "ses_sender_email" {
  description = "Verified SES sender email address"
  type        = string
  default     = ""
}

variable "email_enabled" {
  description = "Enable welcome email sending"
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email address for plan generation DLQ alarm notifications"
  type        = string
  default     = ""
}

variable "plan_generation_mapping_enabled" {
  description = "Enable the SQS event-source mapping for the plan generation worker (go-live switch)"
  type        = bool
  default     = false
}
