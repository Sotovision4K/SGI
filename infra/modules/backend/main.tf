resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# NOTE: SES starts in sandbox mode. Until production access is granted,
# emails can only be sent to verified addresses.
# Verify recipient addresses in AWS Console > SES > Verified identities.
resource "aws_sesv2_email_identity" "sender" {
  count          = var.email_enabled ? 1 : 0
  email_identity = var.ses_sender_email
}

resource "aws_iam_role_policy" "lambda_ssm" {
  name = "${var.project_name}-${var.environment}-lambda-ssm"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SsmGetParameter"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = [
          "arn:aws:ssm:*:*:parameter/${var.project_name}/${var.environment}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_ses" {
  name = "${var.project_name}-${var.environment}-lambda-ses"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = var.email_enabled ? aws_sesv2_email_identity.sender[0].arn : "*"
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-${var.environment}-api"

  filename         = "function.zip"
  source_code_hash = fileexists("function.zip") ? filebase64sha256("function.zip") : ""
  handler          = "handler.handler"
  runtime          = var.runtime
  role             = aws_iam_role.lambda_exec.arn
  memory_size      = var.memory_size
  timeout          = var.timeout

  environment {
    variables = {
      ENVIRONMENT               = var.environment
      DATABASE_URL              = var.database_url
      ANTHROPIC_API_KEY         = var.anthropic_api_key
      AWS_COGNITO_USER_POOL_ID  = var.cognito_user_pool_id
      AWS_COGNITO_CLIENT_ID     = var.cognito_client_id
      AWS_COGNITO_REGION        = var.cognito_region
      AWS_COGNITO_JWKS_URL      = var.cognito_jwks_url
      CORS_ALLOW_ORIGINS        = var.cors_allow_origins
      SES_SENDER_EMAIL          = var.ses_sender_email
      EMAIL_ENABLED             = var.email_enabled
      PLAN_GENERATION_QUEUE_URL = aws_sqs_queue.plan_generation.url
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-api"
    Environment = var.environment
  }
}

# ── Plan Generation: SQS queues ────────────────────────────────────────────

resource "aws_sqs_queue" "plan_generation_dlq" {
  name                      = "${var.project_name}-${var.environment}-plan-generation-dlq"
  message_retention_seconds = 259200 # 3 days
}

resource "aws_sqs_queue" "plan_generation" {
  name                       = "${var.project_name}-${var.environment}-plan-generation"
  visibility_timeout_seconds = var.plan_generation_visibility_timeout # 900s — > Lambda timeout (600s) and > LEASE_TTL (300s)
  message_retention_seconds  = 259200                                 # 3 days

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.plan_generation_dlq.arn
    maxReceiveCount     = var.plan_generation_max_receive_count # 4
  })
}

# Queue resource policy — least privilege (security H1): only the API Lambda role may SendMessage.
resource "aws_sqs_queue_policy" "plan_generation" {
  queue_url = aws_sqs_queue.plan_generation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSendFromApiLambdaRoleOnly"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.lambda_exec.arn
        }
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.plan_generation.arn
      }
    ]
  })
}

# Least-privilege identity policy on the Lambda exec role.
resource "aws_iam_role_policy" "lambda_sqs" {
  name = "${var.project_name}-${var.environment}-lambda-sqs"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SqsEnqueueMainQueue"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.plan_generation.arn
      },
      {
        Sid    = "SqsPollMainQueue"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl"
        ]
        Resource = aws_sqs_queue.plan_generation.arn
      }
    ]
  })
}

resource "aws_lambda_event_source_mapping" "plan_generation" {
  event_source_arn = aws_sqs_queue.plan_generation.arn
  function_name    = aws_lambda_function.api.arn

  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = var.plan_generation_mapping_enabled

  lifecycle {
    precondition {
      condition     = var.plan_generation_visibility_timeout > var.timeout && var.plan_generation_visibility_timeout > 300
      error_message = "plan_generation_visibility_timeout must be strictly greater than both the Lambda timeout and LEASE_TTL_SECONDS (300)."
    }
  }
}

# ── Plan Generation: DLQ alarm → SNS ────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-plan-generation-alerts"
}

resource "aws_sns_topic_subscription" "email_alerts" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "dlq_has_messages" {
  alarm_name          = "${var.project_name}-${var.environment}-plan-generation-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Alert when the plan generation DLQ has messages (indicates a terminal failure)."
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.plan_generation_dlq.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

resource "aws_api_gateway_rest_api" "api" {
  name        = "${var.project_name}-${var.environment}-api"
  description = "${var.project_name} API Gateway"

  tags = {
    Environment = var.environment
  }
}

resource "aws_api_gateway_resource" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.api.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.api.id
  http_method = aws_api_gateway_method.any.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.api.invoke_arn
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_api_gateway_stage" "api" {
  deployment_id = aws_api_gateway_deployment.api.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = "v1"

  tags = {
    Environment = var.environment
  }
}

resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.api.id,
      aws_api_gateway_method.any.id,
      aws_api_gateway_integration.lambda.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}