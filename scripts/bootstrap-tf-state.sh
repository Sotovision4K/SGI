#!/usr/bin/env bash
# =============================================================================
# bootstrap-tf-state.sh — Bootstrap S3 + DynamoDB for Terraform remote state
# =============================================================================
# Creates (idempotently):
#   1. S3 bucket       cert-app-dev-tfstate (versioned, encrypted, no public access)
#   2. DynamoDB table  cert-app-dev-tfstate-lock (PAY_PER_REQUEST, LockID key)
#
# Usage:
#   ./scripts/bootstrap-tf-state.sh [aws-region]
#
# Default region: us-east-1
# =============================================================================

set -euo pipefail

REGION="${1:-us-east-1}"
BUCKET="cert-app-dev-tfstate"
TABLE="cert-app-dev-tfstate-lock"

# ── Colour helpers ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Colour

error()   { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }
info()    { echo -e "${YELLOW}→${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }

# ── Pre-flight checks ────────────────────────────────────────────────────────
command -v aws.exe >/dev/null 2>&1 || error "AWS CLI is required. Install it: https://aws.amazon.com/cli/"

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD} Terraform State Bootstrap${NC}"
echo -e "${BOLD}========================================${NC}"
echo " Region : ${REGION}"
echo " Bucket : ${BUCKET}"
echo " Table  : ${TABLE}"
echo ""

# ── S3 bucket ────────────────────────────────────────────────────────────────
info "Checking S3 bucket '${BUCKET}'..."

if aws.exe s3api head-bucket --bucket "${BUCKET}" --region "${REGION}" 2>/dev/null; then
  success "S3 bucket '${BUCKET}' already exists (skipping creation)"
else
  info "Creating S3 bucket '${BUCKET}' in ${REGION}..."
  if [ "${REGION}" = "us-east-1" ]; then
    aws.exe s3api create-bucket \
      --bucket "${BUCKET}" \
      --region "${REGION}"
  else
    aws.exe s3api create-bucket \
      --bucket "${BUCKET}" \
      --region "${REGION}" \
      --create-bucket-configuration "LocationConstraint=${REGION}"
  fi
  success "S3 bucket '${BUCKET}' created"
fi

# Versioning
info "Enabling versioning on '${BUCKET}'..."
aws.exe s3api put-bucket-versioning \
  --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled
success "Versioning enabled"

# Server-side encryption (AES256)
info "Enabling server-side encryption (AES256) on '${BUCKET}'..."
aws.exe s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
success "Encryption enabled (AES256)"

# Block all public access
info "Blocking public access on '${BUCKET}'..."
aws.exe s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
success "Public access blocked"

# ── DynamoDB lock table ──────────────────────────────────────────────────────
info "Checking DynamoDB table '${TABLE}'..."

if aws.exe dynamodb describe-table --table-name "${TABLE}" --region "${REGION}" 2>/dev/null; then
  success "DynamoDB table '${TABLE}' already exists (skipping creation)"
else
  info "Creating DynamoDB table '${TABLE}'..."
  aws.exe  dynamodb create-table \
    --table-name "${TABLE}" \
    --region "${REGION}" \
    --attribute-definitions "AttributeName=LockID,AttributeType=S" \
    --key-schema "AttributeName=LockID,KeyType=HASH" \
    --billing-mode PAY_PER_REQUEST

  info "Waiting for table '${TABLE}' to become active..."
  aws.exe dynamodb wait table-exists --table-name "${TABLE}" --region "${REGION}"
  success "DynamoDB table '${TABLE}' created (billing: PAY_PER_REQUEST)"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${GREEN}${BOLD} Bootstrap complete!${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo "  1. Update infra/environments/dev/providers.tf to use the S3 backend."
echo "     Uncomment (or add) the following block and run terraform init:"
echo ""
echo -e "     ${YELLOW}terraform {${NC}"
echo -e "     ${YELLOW}  backend \"s3\" {${NC}"
echo -e "     ${YELLOW}    bucket         = \"${BUCKET}\"${NC}"
echo -e "     ${YELLOW}    key            = \"dev/terraform.tfstate\"${NC}"
echo -e "     ${YELLOW}    region         = \"${REGION}\"${NC}"
echo -e "     ${YELLOW}    dynamodb_table = \"${TABLE}\"${NC}"
echo -e "     ${YELLOW}    encrypt        = true${NC}"
echo -e "     ${YELLOW}  }${NC}"
echo -e "     ${YELLOW}}${NC}"
echo ""
echo "  2. cd infra/environments/dev/"
echo "  3. terraform init -reconfigure"
echo "  4. terraform plan"
echo ""
