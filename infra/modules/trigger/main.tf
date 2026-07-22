resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-${var.environment}-trigger-lambda-role"

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

resource "aws_lambda_function" "post_signup" {
  function_name = "${var.project_name}-${var.environment}-post-signup"

  filename         = var.lambda_zip_path
  source_code_hash = fileexists(var.lambda_zip_path) ? filebase64sha256(var.lambda_zip_path) : ""
  handler          = "trigger_handler.handler"
  runtime          = var.runtime
  role             = aws_iam_role.lambda_exec.arn
  memory_size      = 128
  timeout          = 10

  environment {
    variables = {
      DATABASE_URL = var.database_url
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-post-signup"
    Environment = var.environment
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}
