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
      ENVIRONMENT             = var.environment
      DATABASE_URL            = var.database_url
      ANTHROPIC_API_KEY       = var.anthropic_api_key
      AWS_COGNITO_USER_POOL_ID = var.cognito_user_pool_id
      AWS_COGNITO_CLIENT_ID   = var.cognito_client_id
      AWS_COGNITO_REGION      = var.cognito_region
      AWS_COGNITO_JWKS_URL    = var.cognito_jwks_url
      CORS_ALLOW_ORIGINS      = var.cors_allow_origins
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-api"
    Environment = var.environment
  }
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