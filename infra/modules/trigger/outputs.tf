output "post_signup_lambda_arn" {
  description = "Post-signup trigger Lambda ARN"
  value       = aws_lambda_function.post_signup.arn
}

output "post_signup_lambda_name" {
  description = "Post-signup trigger Lambda function name"
  value       = aws_lambda_function.post_signup.function_name
}
