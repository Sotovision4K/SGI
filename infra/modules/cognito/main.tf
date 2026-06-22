data "aws_region" "current" {}

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-user-pool"

  alias_attributes = ["email", "phone_number"]

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable            = false
  }

  schema {
    name                = "phone_number"
    attribute_data_type = "String"
    required            = false
    mutable            = true
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable            = true
  }

  schema {
    name                = "custom:role"
    attribute_data_type = "String"
    required            = false
    mutable            = true
  }

  schema {
    name                = "custom:gov_id"
    attribute_data_type = "String"
    required            = false
    mutable            = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-user-pool"
    Environment = var.environment
  }

  lifecycle {
    # Schema attributes cannot be modified or removed after creation
    ignore_changes = [schema]
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "web" {
  name = "${var.project_name}-${var.environment}-web-client"

  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret              = false
  prevent_user_existence_errors = "ENABLED"

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = var.allowed_oauth_scopes
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  supported_identity_providers = ["COGNITO"]

  access_token_validity   = 1
  id_token_validity       = 1
  refresh_token_validity  = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  read_attributes  = ["email", "phone_number", "name", "custom:role", "custom:gov_id"]
  write_attributes = ["email", "phone_number", "name", "custom:role", "custom:gov_id"]
}

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name = "${var.project_name}-${var.environment}-identity-pool"

  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id             = aws_cognito_user_pool_client.web.id
    provider_name         = aws_cognito_user_pool.main.endpoint
    server_side_token_check = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-identity-pool"
    Environment = var.environment
  }
}