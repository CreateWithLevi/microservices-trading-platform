# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC"
  value       = module.vpc.vpc_cidr
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "database_subnet_ids" {
  description = "List of database subnet IDs"
  value       = module.vpc.database_subnet_ids
}

# EKS Outputs
output "eks_cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_id
}

output "eks_cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_node_group_id" {
  description = "EKS node group ID"
  value       = module.eks.node_group_id
}

output "eks_configure_kubectl" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_id}"
}

# ECR Outputs
output "ecr_repository_urls" {
  description = "Map of ECR repository names to their URLs"
  value       = module.ecr.repository_urls
}

output "ecr_repository_arns" {
  description = "Map of ECR repository names to their ARNs"
  value       = module.ecr.repository_arns
}

# RDS Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint (host:port)"
  value       = module.rds.endpoint
}

output "rds_address" {
  description = "RDS instance hostname"
  value       = module.rds.address
}

output "rds_port" {
  description = "RDS instance port"
  value       = module.rds.port
}

output "rds_database_name" {
  description = "Name of the database"
  value       = module.rds.database_name
}

output "rds_master_username" {
  description = "Master username for RDS"
  value       = module.rds.master_username
  sensitive   = true
}

output "rds_connection_string" {
  description = "PostgreSQL connection string (without password)"
  value       = "postgresql://${module.rds.master_username}@${module.rds.endpoint}/${module.rds.database_name}"
  sensitive   = true
}

output "rds_master_password_secret_arn" {
  description = "ARN of the secret containing RDS master password"
  value       = module.rds.master_password_secret_arn
}

# ElastiCache Outputs
output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = module.elasticache.primary_endpoint
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint (for read replicas)"
  value       = module.elasticache.reader_endpoint
}

output "redis_port" {
  description = "Redis port"
  value       = module.elasticache.port
}

output "redis_connection_string" {
  description = "Redis connection string"
  value       = "redis://${module.elasticache.primary_endpoint}:${module.elasticache.port}"
}

# Amazon MQ Outputs
output "rabbitmq_broker_id" {
  description = "Amazon MQ broker ID"
  value       = module.amazonmq.broker_id
}

output "rabbitmq_broker_arn" {
  description = "Amazon MQ broker ARN"
  value       = module.amazonmq.broker_arn
}

output "rabbitmq_endpoints" {
  description = "List of all Amazon MQ broker endpoints"
  value       = module.amazonmq.broker_endpoints
}

output "rabbitmq_amqp_endpoint" {
  description = "AMQP endpoint for RabbitMQ"
  value       = module.amazonmq.amqp_endpoint
}

output "rabbitmq_console_url" {
  description = "Web console URL for RabbitMQ"
  value       = module.amazonmq.console_url
}

output "rabbitmq_username" {
  description = "RabbitMQ username"
  value       = module.amazonmq.username
  sensitive   = true
}

output "rabbitmq_password_secret_arn" {
  description = "ARN of the secret containing RabbitMQ password"
  value       = module.amazonmq.password_secret_arn
}

output "rabbitmq_connection_string" {
  description = "RabbitMQ AMQP connection string (without password)"
  value       = "amqp://${module.amazonmq.username}@${module.amazonmq.amqp_endpoint}"
  sensitive   = true
}

# Summary Output for Easy Reference
output "connection_strings_summary" {
  description = "Summary of all connection strings for Kubernetes Secrets"
  value = {
    rds_endpoint     = module.rds.endpoint
    rds_password_secret = module.rds.master_password_secret_arn
    redis_endpoint   = "${module.elasticache.primary_endpoint}:${module.elasticache.port}"
    rabbitmq_endpoint = module.amazonmq.amqp_endpoint
    rabbitmq_password_secret = module.amazonmq.password_secret_arn
    rabbitmq_console = module.amazonmq.console_url
  }
  sensitive = true
}
