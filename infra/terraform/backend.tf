# Remote State Configuration
#
# Uncomment this block after creating the S3 bucket and DynamoDB table for state locking.
# This keeps your Terraform state file in S3 with encryption and versioning enabled.
#
# Prerequisites:
# 1. Create S3 bucket: aws s3 mb s3://trading-platform-terraform-state --region us-east-1
# 2. Enable versioning: aws s3api put-bucket-versioning --bucket trading-platform-terraform-state --versioning-configuration Status=Enabled
# 3. Enable encryption: aws s3api put-bucket-encryption --bucket trading-platform-terraform-state --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
# 4. Create DynamoDB table for locking:
#    aws dynamodb create-table --table-name trading-platform-terraform-locks \
#      --attribute-definitions AttributeName=LockID,AttributeType=S \
#      --key-schema AttributeName=LockID,KeyType=HASH \
#      --billing-mode PAY_PER_REQUEST \
#      --region us-east-1

# terraform {
#   backend "s3" {
#     bucket         = "trading-platform-terraform-state"
#     key            = "prod/terraform.tfstate"
#     region         = "us-east-1"
#     encrypt        = true
#     dynamodb_table = "trading-platform-terraform-locks"
#
#     # Optional: Use different state files per environment
#     # workspace_key_prefix = "env"
#   }
# }

# For local development/testing, Terraform will use local state files.
# Run 'terraform init' first, then uncomment the above block and run 'terraform init -migrate-state'
# to migrate your local state to S3.
