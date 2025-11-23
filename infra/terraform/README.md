# Terraform Infrastructure for Trading Platform

This directory contains production-grade Terraform configuration to provision AWS infrastructure for the microservices-based trading platform.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Infrastructure Components](#infrastructure-components)
- [Directory Structure](#directory-structure)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Steps](#deployment-steps)
- [Post-Deployment](#post-deployment)
- [Outputs and Connection Strings](#outputs-and-connection-strings)
- [Managing Secrets](#managing-secrets)
- [Cost Optimization](#cost-optimization)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)

## 🏗️ Architecture Overview

This Terraform configuration provisions a complete AWS infrastructure stack:

```
┌─────────────────────────────────────────────────────────────────┐
│                           VPC (10.0.0.0/16)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Public Subnet│  │ Public Subnet│  │ Public Subnet│          │
│  │   us-east-1a │  │   us-east-1b │  │   us-east-1c │          │
│  │  (Load Bal.) │  │  (Load Bal.) │  │  (Load Bal.) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │ NAT              │ NAT              │ NAT              │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │Private Subnet│  │Private Subnet│  │Private Subnet│          │
│  │   us-east-1a │  │   us-east-1b │  │   us-east-1c │          │
│  │  (EKS Nodes) │  │  (EKS Nodes) │  │  (EKS Nodes) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │  DB Subnet   │  │  DB Subnet   │  │  DB Subnet   │          │
│  │   us-east-1a │  │   us-east-1b │  │   us-east-1c │          │
│  │ (RDS, Redis, │  │ (RDS, Redis, │  │ (RDS, Redis, │          │
│  │   RabbitMQ)  │  │   RabbitMQ)  │  │   RabbitMQ)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘

Components:
├── EKS Cluster (Kubernetes 1.28)
│   └── Managed Node Group (t3.medium, 2-6 nodes)
├── ECR Repositories (service-a, b, c, d, e, n, frontend)
├── RDS PostgreSQL (db.t3.medium, Multi-AZ)
├── ElastiCache Redis (cache.t3.medium, 2 nodes with failover)
└── Amazon MQ RabbitMQ (mq.t3.micro, Multi-AZ cluster)
```

## ✅ Prerequisites

Before you begin, ensure you have:

1. **AWS CLI** installed and configured
   ```bash
   aws --version
   aws configure
   ```

2. **Terraform** installed (>= 1.5.0)
   ```bash
   terraform --version
   ```

3. **AWS Credentials** with sufficient permissions:
   - VPC, EC2, EKS, RDS, ElastiCache, Amazon MQ
   - IAM roles and policies
   - Secrets Manager, KMS, CloudWatch
   - ECR repositories

4. **kubectl** installed (for EKS cluster access)
   ```bash
   kubectl version --client
   ```

## 🧱 Infrastructure Components

### 1. **VPC Module** (`modules/vpc/`)
- **Purpose**: Network foundation with isolated subnets
- **Resources**:
  - VPC with DNS support enabled
  - 3 Public subnets (for Load Balancers)
  - 3 Private subnets (for EKS nodes)
  - 3 Database subnets (for managed services)
  - Internet Gateway + 3 NAT Gateways (high availability)
  - Route tables and associations
  - VPC Flow Logs for network monitoring

### 2. **EKS Module** (`modules/eks/`)
- **Purpose**: Kubernetes cluster for container orchestration
- **Resources**:
  - EKS control plane (Kubernetes 1.28)
  - Managed node group (t3.medium instances)
  - Auto-scaling configuration (2-6 nodes)
  - IAM roles and policies
  - OIDC provider for service account integration
  - EKS add-ons (VPC CNI, kube-proxy, CoreDNS)
  - Security groups with least-privilege access
  - CloudWatch logging enabled

### 3. **ECR Module** (`modules/ecr/`)
- **Purpose**: Private container image repositories
- **Resources**:
  - 7 ECR repositories (service-a, b, c, d, e, n, frontend)
  - Image scanning on push (vulnerability detection)
  - Lifecycle policies (keep last 10 images, clean untagged)
  - Encryption at rest (AES256)
  - Repository policies for EKS access

### 4. **RDS Module** (`modules/rds/`)
- **Purpose**: Managed PostgreSQL database (TimescaleDB/Kong)
- **Resources**:
  - RDS PostgreSQL 15.4 (db.t3.medium)
  - Multi-AZ deployment for high availability
  - 100GB GP3 storage with auto-scaling to 200GB
  - Automated backups (7-day retention)
  - Enhanced monitoring and Performance Insights
  - Security group with EKS-only access
  - Password stored in AWS Secrets Manager
  - CloudWatch alarms (CPU, storage, connections)

### 5. **ElastiCache Module** (`modules/elasticache/`)
- **Purpose**: Managed Redis cache cluster
- **Resources**:
  - Redis 7.0 replication group (cache.t3.medium)
  - 2 cache nodes with automatic failover
  - Multi-AZ deployment
  - Encryption at rest and in transit
  - AUTH token authentication
  - Automated backups (5-day retention)
  - CloudWatch alarms (CPU, memory, evictions, connections)

### 6. **Amazon MQ Module** (`modules/amazonmq/`)
- **Purpose**: Managed RabbitMQ message broker
- **Resources**:
  - RabbitMQ 3.11.20 (mq.t3.micro)
  - Multi-AZ cluster deployment
  - Encryption with customer-managed KMS key
  - Web management console
  - Password stored in AWS Secrets Manager
  - CloudWatch alarms (CPU, memory, disk, connections)

## 📁 Directory Structure

```
infra/terraform/
├── main.tf                      # Root module - orchestrates all modules
├── variables.tf                 # Input variables
├── outputs.tf                   # Output values (connection strings, etc.)
├── backend.tf                   # S3 backend configuration (commented)
├── terraform.tfvars.example     # Example variable values
├── README.md                    # This file
│
└── modules/
    ├── vpc/
    │   ├── main.tf              # VPC resources
    │   ├── variables.tf         # VPC module variables
    │   └── outputs.tf           # VPC module outputs
    │
    ├── eks/
    │   ├── main.tf              # EKS cluster and node group
    │   ├── variables.tf         # EKS module variables
    │   └── outputs.tf           # EKS module outputs
    │
    ├── ecr/
    │   ├── main.tf              # ECR repositories
    │   ├── variables.tf         # ECR module variables
    │   └── outputs.tf           # ECR module outputs
    │
    ├── rds/
    │   ├── main.tf              # RDS PostgreSQL instance
    │   ├── variables.tf         # RDS module variables
    │   └── outputs.tf           # RDS module outputs
    │
    ├── elasticache/
    │   ├── main.tf              # ElastiCache Redis cluster
    │   ├── variables.tf         # ElastiCache module variables
    │   └── outputs.tf           # ElastiCache module outputs
    │
    └── amazonmq/
        ├── main.tf              # Amazon MQ RabbitMQ broker
        ├── variables.tf         # Amazon MQ module variables
        └── outputs.tf           # Amazon MQ module outputs
```

## 🚀 Quick Start

### 1. Clone and Navigate
```bash
cd infra/terraform
```

### 2. Create Variable File
```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your desired configuration
```

### 3. Initialize Terraform
```bash
terraform init
```

### 4. Review Plan
```bash
terraform plan -out=tfplan
```

### 5. Apply Configuration
```bash
terraform apply tfplan
```

## ⚙️ Configuration

### Custom Variable File

Create a `terraform.tfvars` file to override default values:

```hcl
# General Configuration
aws_region   = "us-east-1"
project_name = "trading-platform"
environment  = "prod"

# VPC Configuration
vpc_cidr            = "10.0.0.0/16"
availability_zones  = ["us-east-1a", "us-east-1b", "us-east-1c"]

# EKS Configuration
eks_cluster_version    = "1.28"
eks_node_instance_types = ["t3.medium"]
eks_node_desired_size  = 3
eks_node_min_size      = 2
eks_node_max_size      = 6

# RDS Configuration
rds_instance_class     = "db.t3.medium"
rds_allocated_storage  = 100
rds_master_username    = "dbadmin"
rds_multi_az           = true

# ElastiCache Configuration
redis_node_type        = "cache.t3.medium"
redis_num_cache_nodes  = 2

# Amazon MQ Configuration
mq_broker_instance_type = "mq.t3.micro"
mq_deployment_mode      = "CLUSTER_MULTI_AZ"
mq_username             = "admin"
```

### Environment-Specific Configurations

For different environments (dev, staging, prod), create separate `.tfvars` files:

```bash
# Development
terraform apply -var-file="environments/dev.tfvars"

# Staging
terraform apply -var-file="environments/staging.tfvars"

# Production
terraform apply -var-file="environments/prod.tfvars"
```

## 📝 Deployment Steps

### Step 1: Initialize Terraform

```bash
cd infra/terraform
terraform init
```

**Expected output:**
```
Initializing modules...
Initializing the backend...
Initializing provider plugins...
Terraform has been successfully initialized!
```

### Step 2: Validate Configuration

```bash
terraform validate
```

**Expected output:**
```
Success! The configuration is valid.
```

### Step 3: Plan Infrastructure

```bash
terraform plan -out=tfplan
```

This will:
- Show all resources to be created
- Validate dependencies
- Estimate costs (use AWS Cost Calculator)
- Save execution plan to `tfplan` file

**Review the plan carefully!** You should see approximately:
- 70+ resources to be created
- VPC, subnets, route tables
- EKS cluster and node group
- ECR repositories
- RDS instance
- ElastiCache cluster
- Amazon MQ broker

### Step 4: Apply Configuration

```bash
terraform apply tfplan
```

**Note:** This will take approximately **20-30 minutes** to complete.

Progress indicators:
- VPC and networking: ~2-3 minutes
- EKS cluster: ~10-15 minutes
- RDS instance: ~5-10 minutes
- ElastiCache: ~5-8 minutes
- Amazon MQ: ~5-8 minutes

### Step 5: Verify Outputs

```bash
terraform output
```

Save important outputs:
```bash
terraform output -json > outputs.json
```

## 🔌 Post-Deployment

### 1. Configure kubectl for EKS

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --region us-east-1 \
  --name trading-platform-prod

# Verify access
kubectl get nodes
```

**Expected output:**
```
NAME                          STATUS   ROLES    AGE   VERSION
ip-10-0-10-xxx.ec2.internal   Ready    <none>   5m    v1.28.x
ip-10-0-11-xxx.ec2.internal   Ready    <none>   5m    v1.28.x
ip-10-0-12-xxx.ec2.internal   Ready    <none>   5m    v1.28.x
```

### 2. Retrieve Database Passwords

```bash
# RDS password
aws secretsmanager get-secret-value \
  --secret-id trading-platform-prod-rds-master-password \
  --query SecretString \
  --output text | jq -r .password

# Redis auth token
aws secretsmanager get-secret-value \
  --secret-id trading-platform-prod-redis-auth-token \
  --query SecretString \
  --output text | jq -r .auth_token

# RabbitMQ password
aws secretsmanager get-secret-value \
  --secret-id trading-platform-prod-mq-password \
  --query SecretString \
  --output text | jq -r .password
```

### 3. Create Kubernetes Secrets

Create a file `k8s-secrets.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: database-credentials
type: Opaque
stringData:
  POSTGRES_HOST: <rds_endpoint>
  POSTGRES_PORT: "5432"
  POSTGRES_DB: "tradingdb"
  POSTGRES_USER: "dbadmin"
  POSTGRES_PASSWORD: <password_from_secrets_manager>
---
apiVersion: v1
kind: Secret
metadata:
  name: redis-credentials
type: Opaque
stringData:
  REDIS_HOST: <redis_endpoint>
  REDIS_PORT: "6379"
  REDIS_AUTH_TOKEN: <auth_token_from_secrets_manager>
---
apiVersion: v1
kind: Secret
metadata:
  name: rabbitmq-credentials
type: Opaque
stringData:
  RABBITMQ_HOST: <amqp_endpoint>
  RABBITMQ_PORT: "5671"
  RABBITMQ_USER: "admin"
  RABBITMQ_PASSWORD: <password_from_secrets_manager>
```

Apply secrets:
```bash
kubectl apply -f k8s-secrets.yaml
```

### 4. Build and Push Docker Images to ECR

```bash
# Get ECR login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push service-a
cd service-a
docker build -t trading-platform-prod-service-a .
docker tag trading-platform-prod-service-a:latest \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com/trading-platform-prod-service-a:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/trading-platform-prod-service-a:latest

# Repeat for other services (service-b, service-c, etc.)
```

## 📊 Outputs and Connection Strings

### View All Outputs

```bash
terraform output
```

### Key Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `eks_cluster_endpoint` | EKS API server endpoint | `https://xxx.eks.amazonaws.com` |
| `eks_configure_kubectl` | Command to configure kubectl | `aws eks update-kubeconfig...` |
| `rds_endpoint` | PostgreSQL endpoint | `trading-platform-prod.xxx.rds.amazonaws.com:5432` |
| `redis_endpoint` | Redis primary endpoint | `trading-platform-prod.xxx.cache.amazonaws.com` |
| `rabbitmq_amqp_endpoint` | RabbitMQ AMQP endpoint | `amqps://b-xxx.mq.us-east-1.amazonaws.com:5671` |
| `rabbitmq_console_url` | RabbitMQ web console | `https://b-xxx.mq.us-east-1.amazonaws.com` |
| `ecr_repository_urls` | ECR repository URLs | Map of service names to URLs |

### Connection String Summary

```bash
terraform output connection_strings_summary
```

This provides a consolidated view of all connection endpoints for easy reference.

## 🔐 Managing Secrets

All sensitive credentials are stored in **AWS Secrets Manager** and encrypted at rest.

### Retrieve Secrets Programmatically

```bash
# Using AWS CLI
aws secretsmanager get-secret-value \
  --secret-id trading-platform-prod-rds-master-password

# Using Python (boto3)
import boto3
import json

client = boto3.client('secretsmanager', region_name='us-east-1')
response = client.get_secret_value(SecretId='trading-platform-prod-rds-master-password')
secret = json.loads(response['SecretString'])
password = secret['password']
```

### Rotate Secrets

AWS Secrets Manager supports automatic rotation for RDS:

```bash
aws secretsmanager rotate-secret \
  --secret-id trading-platform-prod-rds-master-password \
  --rotation-lambda-arn <lambda-arn>
```

## 💰 Cost Optimization

### Estimated Monthly Costs (us-east-1)

| Component | Instance Type | Cost (approx.) |
|-----------|---------------|----------------|
| EKS Cluster | - | $73/month |
| EKS Nodes (3x t3.medium) | t3.medium | $75/month |
| RDS PostgreSQL | db.t3.medium | $70/month |
| ElastiCache Redis | cache.t3.medium | $50/month |
| Amazon MQ RabbitMQ | mq.t3.micro | $40/month |
| NAT Gateways (3x) | - | $100/month |
| Data Transfer | - | Variable |
| **Total** | | **~$410/month** |

### Cost Reduction Strategies

1. **Development Environment:**
   ```hcl
   # terraform.tfvars for dev
   eks_node_instance_types = ["t3.small"]
   eks_node_desired_size  = 1
   rds_instance_class     = "db.t3.micro"
   rds_multi_az           = false
   redis_node_type        = "cache.t3.micro"
   redis_num_cache_nodes  = 1
   mq_deployment_mode     = "SINGLE_INSTANCE"
   ```

2. **Use Single NAT Gateway** (non-prod):
   - Modify VPC module to use 1 NAT Gateway
   - Saves ~$64/month

3. **Stop Resources During Off-Hours:**
   - Use AWS Instance Scheduler for EKS nodes
   - Enable RDS stop/start automation

4. **Reserved Instances:**
   - Purchase 1-year or 3-year RIs for predictable savings

## 🔧 Troubleshooting

### Issue: Terraform State Lock

**Error:**
```
Error: Error acquiring the state lock
```

**Solution:**
```bash
# List DynamoDB locks
aws dynamodb scan --table-name trading-platform-terraform-locks

# Force unlock (use with caution!)
terraform force-unlock <LOCK_ID>
```

### Issue: EKS Node Group Fails to Create

**Error:**
```
Error: error waiting for EKS Node Group to become ready
```

**Solution:**
1. Check IAM permissions for node role
2. Verify subnet has sufficient IP addresses
3. Check AWS Service Quotas for EC2 instances

```bash
aws service-quotas get-service-quota \
  --service-code ec2 \
  --quota-code L-1216C47A
```

### Issue: RDS Creation Timeout

**Error:**
```
Error: timeout while waiting for resource to be ready
```

**Solution:**
1. Increase timeout in RDS module
2. Check RDS subnet group has at least 2 subnets in different AZs
3. Verify security group rules allow traffic

### Issue: kubectl Access Denied

**Error:**
```
error: You must be logged in to the server (Unauthorized)
```

**Solution:**
```bash
# Re-configure kubectl
aws eks update-kubeconfig \
  --region us-east-1 \
  --name trading-platform-prod

# Verify AWS credentials
aws sts get-caller-identity

# Check IAM permissions (eks:DescribeCluster)
```

### Issue: ECR Push Permission Denied

**Error:**
```
denied: User is not authorized to perform: ecr:PutImage
```

**Solution:**
```bash
# Re-authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Verify IAM permissions (ecr:GetAuthorizationToken, ecr:PutImage)
```

## 🧹 Cleanup

### Destroy All Resources

⚠️ **WARNING:** This will permanently delete all infrastructure and data!

```bash
# Remove deletion protection first
terraform apply -var="rds_deletion_protection=false"

# Destroy resources
terraform destroy
```

### Cleanup Order (Manual)

If `terraform destroy` fails, manually delete in this order:

1. **EKS Node Group** (wait for completion)
2. **EKS Cluster** (wait for completion)
3. **RDS Instance** (create final snapshot)
4. **ElastiCache Cluster**
5. **Amazon MQ Broker**
6. **NAT Gateways**
7. **Elastic IPs**
8. **VPC** (last)

### Cleanup Scripts

```bash
# Delete all ECR images first
for repo in service-a service-b service-c service-d service-e service-n frontend; do
  aws ecr batch-delete-image \
    --repository-name trading-platform-prod-$repo \
    --image-ids imageTag=latest
done

# Then destroy
terraform destroy -auto-approve
```

## 📚 Additional Resources

- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Terraform AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [PostgreSQL on RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [ElastiCache for Redis Best Practices](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/BestPractices.html)

## 🤝 Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review Terraform logs: `terraform apply -debug`
3. Check AWS CloudWatch logs for service-specific errors
4. Open a GitHub issue in the project repository

---

**Last Updated:** 2025-11-22
**Terraform Version:** >= 1.5.0
**AWS Provider Version:** ~> 5.0
