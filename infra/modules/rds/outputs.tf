output "db_instance_address" {
  description = "RDS instance endpoint address"
  value       = aws_db_instance.main.address
}

output "db_name" {
  description = "Database name"
  value       = var.db_name
}

output "db_username" {
  description = "Database master username"
  value       = var.db_username
}

output "db_password" {
  description = "Database master password (sensitive)"
  value       = random_password.db.result
  sensitive   = true
}

output "db_url_ssm_parameter_name" {
  description = "SSM parameter path for DATABASE_URL"
  value       = aws_ssm_parameter.db_url.name
}

output "db_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}
