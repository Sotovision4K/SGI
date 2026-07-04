output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.frontend.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.frontend.arn
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  # Uses try() to return "" when CloudFront is not yet created (first apply).
  # Consumers (e.g. Cognito callbacks) should treat "" as "not ready" and fall back to localhost.
  value       = try(aws_cloudfront_distribution.main[0].domain_name, "")
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = try(aws_cloudfront_distribution.main[0].id, "")
}

output "cloudfront_arn" {
  description = "CloudFront distribution ARN"
  value       = try(aws_cloudfront_distribution.main[0].arn, "")
}