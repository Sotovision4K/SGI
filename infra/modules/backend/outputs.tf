output "api_gateway_id" {
  description = "API Gateway ID"
  value       = aws_api_gateway_rest_api.api.id
}

output "api_gateway_stage" {
  description = "API Gateway stage name"
  value       = aws_api_gateway_stage.api.stage_name
}

output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = aws_api_gateway_stage.api.invoke_url
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.api.arn
}

output "plan_generation_queue_url" {
  description = "Plan generation SQS queue URL"
  value       = aws_sqs_queue.plan_generation.url
}

output "plan_generation_dlq_url" {
  description = "Plan generation DLQ URL"
  value       = aws_sqs_queue.plan_generation_dlq.url
}
