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
