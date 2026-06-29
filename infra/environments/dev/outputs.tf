output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = module.cognito.user_pool_arn
}

output "cognito_user_pool_domain" {
  description = "Cognito User Pool Domain"
  value       = module.cognito.user_pool_domain
}

output "cognito_web_client_id" {
  description = "Cognito Web Client ID"
  value       = module.cognito.web_client_id
}

output "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = module.cognito.identity_pool_id
}

output "frontend_cloudfront_domain" {
  description = "Frontend CloudFront domain"
  value       = module.frontend.cloudfront_domain
}

output "frontend_cloudfront_distribution_id" {
  description = "Frontend CloudFront distribution ID"
  value       = module.frontend.cloudfront_distribution_id
}

output "frontend_s3_bucket_name" {
  description = "Frontend S3 bucket name"
  value       = module.frontend.s3_bucket_name
}

output "api_endpoint" {
  description = "Backend API endpoint"
  value       = module.backend.api_endpoint
}