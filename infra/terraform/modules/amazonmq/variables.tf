variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where Amazon MQ will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for Amazon MQ"
  type        = list(string)
}

variable "allowed_security_group_id" {
  description = "Security group ID allowed to access Amazon MQ (typically EKS nodes)"
  type        = string
}

variable "broker_instance_type" {
  description = "Amazon MQ broker instance type"
  type        = string
  default     = "mq.t3.micro"
}

variable "engine_version" {
  description = "RabbitMQ engine version"
  type        = string
  default     = "3.11.20"
}

variable "deployment_mode" {
  description = "Deployment mode (SINGLE_INSTANCE or CLUSTER_MULTI_AZ)"
  type        = string
  default     = "CLUSTER_MULTI_AZ"

  validation {
    condition     = contains(["SINGLE_INSTANCE", "CLUSTER_MULTI_AZ"], var.deployment_mode)
    error_message = "Deployment mode must be either SINGLE_INSTANCE or CLUSTER_MULTI_AZ."
  }
}

variable "username" {
  description = "Master username for Amazon MQ"
  type        = string
}
