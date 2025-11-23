output "broker_id" {
  description = "Amazon MQ broker ID"
  value       = aws_mq_broker.main.id
}

output "broker_arn" {
  description = "Amazon MQ broker ARN"
  value       = aws_mq_broker.main.arn
}

output "broker_endpoints" {
  description = "List of all Amazon MQ broker endpoints and IPs"
  value       = aws_mq_broker.main.instances
}

output "amqp_endpoint" {
  description = "AMQP endpoint for RabbitMQ (amqps://)"
  value       = aws_mq_broker.main.instances[0].endpoints[0]
}

output "console_url" {
  description = "Web console URL for RabbitMQ"
  value       = "https://${aws_mq_broker.main.instances[0].console_url}"
}

output "username" {
  description = "RabbitMQ username"
  value       = var.username
  sensitive   = true
}

output "password_secret_arn" {
  description = "ARN of the secret containing RabbitMQ password"
  value       = aws_secretsmanager_secret.mq_password.arn
}

output "security_group_id" {
  description = "Security group ID for Amazon MQ"
  value       = aws_security_group.mq.id
}

output "configuration_id" {
  description = "Amazon MQ configuration ID"
  value       = aws_mq_configuration.main.id
}

output "configuration_revision" {
  description = "Amazon MQ configuration latest revision"
  value       = aws_mq_configuration.main.latest_revision
}
