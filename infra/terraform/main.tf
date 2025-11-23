terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  project_name        = var.project_name
  environment         = var.environment
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  database_subnet_cidrs = var.database_subnet_cidrs
}

# EKS Module
module "eks" {
  source = "./modules/eks"

  project_name       = var.project_name
  environment        = var.environment
  cluster_version    = var.eks_cluster_version
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  node_group_instance_types = var.eks_node_instance_types
  node_group_desired_size   = var.eks_node_desired_size
  node_group_min_size       = var.eks_node_min_size
  node_group_max_size       = var.eks_node_max_size
}

# ECR Module
module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
  repositories = var.ecr_repositories
}

# RDS Module (PostgreSQL for TimescaleDB/Kong)
module "rds" {
  source = "./modules/rds"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  database_subnet_ids   = module.vpc.database_subnet_ids
  allowed_security_group_id = module.eks.node_security_group_id

  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  engine_version        = var.rds_engine_version
  database_name         = var.rds_database_name
  master_username       = var.rds_master_username
  multi_az              = var.rds_multi_az
  backup_retention_days = var.rds_backup_retention_days
}

# ElastiCache Module (Redis)
module "elasticache" {
  source = "./modules/elasticache"

  project_name               = var.project_name
  environment                = var.environment
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  allowed_security_group_id  = module.eks.node_security_group_id

  node_type                  = var.redis_node_type
  num_cache_nodes            = var.redis_num_cache_nodes
  engine_version             = var.redis_engine_version
  parameter_group_family     = var.redis_parameter_group_family
  automatic_failover_enabled = var.redis_automatic_failover_enabled
}

# Amazon MQ Module (RabbitMQ)
module "amazonmq" {
  source = "./modules/amazonmq"

  project_name              = var.project_name
  environment               = var.environment
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  allowed_security_group_id = module.eks.node_security_group_id

  broker_instance_type      = var.mq_broker_instance_type
  engine_version            = var.mq_engine_version
  deployment_mode           = var.mq_deployment_mode
  username                  = var.mq_username
}
