terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # After running scripts/bootstrap-tf-state.sh, uncomment:
  # backend "s3" {
  #   bucket         = "cert-app-dev-tfstate"
  #   key            = "dev/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "cert-app-dev-tfstate-lock"
  #   encrypt        = true
  # }
}
