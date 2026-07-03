# SGI Pro Infrastructure

Terraform infrastructure for SGI Pro application deployment on AWS.

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              CloudFront                  │
                    │         (Global CDN + SSL)               │
                    └────────────────────┬────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    │                                        │
              ┌─────▼─────┐                          ┌───────▼───────┐
              │  S3 Bucket │                          │  API Gateway   │
              │   (SPA)    │                          │  (REST API)   │
              └───────────┘                          └───────┬───────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │     Lambda Function  │
                                                    │    (FastAPI + Mangum)│
                                                    │     VPC-less         │
                                                    └──────────┬──────────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │       Supabase       │
                                                    │   (Postgres + PgB)   │
                                                    └─────────────────────┘
```

## Modules

| Module | Description |
|--------|-------------|
| `cognito` | User Pool, App Client, Identity Pool, SSM Parameters |
| `frontend` | S3 Bucket, CloudFront Distribution |
| `backend` | Lambda Function (VPC-less), API Gateway, IAM Roles |
| `iam` | GitHub Actions OIDC Role |

## Prerequisites

1. Terraform >= 1.5.0
2. AWS account with appropriate permissions
3. GitHub repository

## Setup

### 1. Initialize Terraform

```bash
cd infra/environments/dev
terraform init
```

### 2. Update terraform.tfvars

Edit `terraform.tfvars` with your values:

```hcl
aws_region             = "us-east-1"
environment            = "dev"
project_name           = "cert-app"
github_repository      = "your-username/cert-app"
supabase_database_url  = "postgresql+asyncpg://postgres.xxx:password@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
anthropic_api_key      = "sk-ant-api-xxx"
```

### 3. Plan and Apply

Secrets (`supabase_database_url`, `anthropic_api_key`) are passed via environment variables:

```bash
export TF_VAR_supabase_database_url="postgresql+asyncpg://..."
export TF_VAR_anthropic_api_key="sk-ant-api-..."
terraform plan -out=tfplan
terraform apply tfplan
```

### 4. Update GitHub Variables

After Terraform apply, add these repository variables in GitHub:

| Variable | Value Source |
|----------|--------------|
| `CF_DISTRIBUTION_ID` | `terraform output cloudfront_distribution_id` |
| `CF_DOMAIN` | CloudFront domain (e.g., `d1234567890.cloudfront.net`) |
| `API_ENDPOINT` | `terraform output api_endpoint` |
| `COGNITO_DOMAIN` | `${project-name}-${environment}` (e.g., `cert-app-dev`) |

## GitHub Secrets

Add these secrets in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `DEV_AWS_ACCESS_KEY_ID` | AWS Access Key ID |
| `DEV_AWS_SECRET_ACCESS_KEY` | AWS Secret Access Key |
| `DATABASE_URL` | Supabase connection string (port 5432, session pooler) |
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM features |

Or use OIDC (recommended):

1. The IAM module creates an OIDC provider and role for GitHub Actions
2. Add the role ARN as a GitHub variable
3. Use `aws-actions/configure-aws-credentials@v4` with `role-to-assume`

## Outputs

After apply, useful outputs:

```bash
terraform output -json | jq -r 'to_entries[] | "\(.key)=\(.value.value)"'
```

Key outputs:
- `cognito_user_pool_id` - User Pool ID for frontend config
- `cognito_web_client_id` - Client ID for frontend config
- `frontend_cloudfront_domain` - CloudFront URL
- `api_endpoint` - API Gateway URL
- `github_actions_role_arn` - Role ARN for GitHub OIDC

## CI/CD

### Frontend Workflow (frontend.yml)

Triggers on changes to `frontend/**`:
1. Get Cognito config from SSM Parameters
2. Create `.env.production` with VITE_* variables
3. Run `pnpm lint` and `pnpm build`
4. Deploy to S3
5. Invalidate CloudFront cache

### Backend Workflow (backend.yml)

Triggers on changes to `backend/**`:
1. Run `uv run ruff check src/`
2. Run `uv run pytest`
3. Package Lambda function
4. Upload to S3 (ready for manual deploy or future automation)

## Cleanup

```bash
terraform destroy
```

## File Structure

```
infra/
├── versions.tf
├── providers.tf
├── variables.tf
├── modules/
│   ├── cognito/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── frontend/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── backend/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── iam/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    └── dev/
        ├── main.tf
        ├── providers.tf
        ├── terraform.tfvars
        └── outputs.tf
```