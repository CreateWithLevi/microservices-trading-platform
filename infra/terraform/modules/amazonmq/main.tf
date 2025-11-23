# Amazon MQ Security Group
resource "aws_security_group" "mq" {
  name        = "${var.project_name}-${var.environment}-mq-sg"
  description = "Security group for Amazon MQ RabbitMQ broker"
  vpc_id      = var.vpc_id

  # AMQP (RabbitMQ)
  ingress {
    from_port       = 5671
    to_port         = 5671
    protocol        = "tcp"
    security_groups = [var.allowed_security_group_id]
    description     = "Allow AMQPS access from EKS nodes"
  }

  # RabbitMQ Management Console
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [var.allowed_security_group_id]
    description     = "Allow HTTPS access to RabbitMQ management console"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-sg"
  }
}

# Random password for Amazon MQ
resource "random_password" "mq_password" {
  length  = 32
  special = true
  # Amazon MQ requires specific character set
  override_special = "!#$%&*()-_=+[]{}<>?"
}

# Store Amazon MQ password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "mq_password" {
  name        = "${var.project_name}-${var.environment}-mq-password"
  description = "Password for Amazon MQ RabbitMQ broker"

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-password"
  }
}

resource "aws_secretsmanager_secret_version" "mq_password" {
  secret_id = aws_secretsmanager_secret.mq_password.id
  secret_string = jsonencode({
    username = var.username
    password = random_password.mq_password.result
    broker_id = aws_mq_broker.main.id
    console_url = "https://${aws_mq_broker.main.instances[0].console_url}"
  })
}

# Amazon MQ Configuration
resource "aws_mq_configuration" "main" {
  name           = "${var.project_name}-${var.environment}-mq-config"
  description    = "RabbitMQ configuration for ${var.project_name} ${var.environment}"
  engine_type    = "RabbitMQ"
  engine_version = var.engine_version

  data = <<DATA
# Default RabbitMQ delivery acknowledgement timeout is 30 minutes in milliseconds
consumer_timeout = 1800000

# Disk free space limit (80% of available disk)
disk_free_limit.absolute = 5GB
DATA

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-config"
  }
}

# Amazon MQ Broker (RabbitMQ)
resource "aws_mq_broker" "main" {
  broker_name = "${var.project_name}-${var.environment}-rabbitmq"

  # Engine Configuration
  engine_type        = "RabbitMQ"
  engine_version     = var.engine_version
  host_instance_type = var.broker_instance_type
  deployment_mode    = var.deployment_mode

  # Authentication
  user {
    username = var.username
    password = random_password.mq_password.result
  }

  # Network Configuration
  subnet_ids         = var.deployment_mode == "CLUSTER_MULTI_AZ" ? slice(var.private_subnet_ids, 0, 2) : [var.private_subnet_ids[0]]
  security_groups    = [aws_security_group.mq.id]
  publicly_accessible = false

  # Configuration
  configuration {
    id       = aws_mq_configuration.main.id
    revision = aws_mq_configuration.main.latest_revision
  }

  # Encryption
  encryption_options {
    use_aws_owned_key = false
    kms_key_id        = aws_kms_key.mq.id
  }

  # Maintenance
  maintenance_window_start_time {
    day_of_week = "SUNDAY"
    time_of_day = "03:00"
    time_zone   = "UTC"
  }

  # Logs
  logs {
    general = true
  }

  # Auto minor version upgrade
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project_name}-${var.environment}-rabbitmq"
  }

  lifecycle {
    ignore_changes = [
      user[0].password
    ]
  }
}

# KMS Key for Amazon MQ encryption
resource "aws_kms_key" "mq" {
  description             = "KMS key for Amazon MQ ${var.project_name}-${var.environment}"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-kms"
  }
}

resource "aws_kms_alias" "mq" {
  name          = "alias/${var.project_name}-${var.environment}-mq"
  target_key_id = aws_kms_key.mq.key_id
}

# CloudWatch Log Group for Amazon MQ
resource "aws_cloudwatch_log_group" "mq" {
  name              = "/aws/amazonmq/broker/${var.project_name}-${var.environment}-rabbitmq"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-logs"
  }
}

# CloudWatch Alarms for Amazon MQ
resource "aws_cloudwatch_metric_alarm" "mq_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-mq-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CpuUtilization"
  namespace           = "AWS/AmazonMQ"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Amazon MQ CPU utilization"

  dimensions = {
    Broker = aws_mq_broker.main.broker_name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-cpu-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "mq_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-mq-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "RabbitMQMemUsed"
  namespace           = "AWS/AmazonMQ"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Amazon MQ memory utilization percentage"

  dimensions = {
    Broker = aws_mq_broker.main.broker_name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-memory-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "mq_disk" {
  alarm_name          = "${var.project_name}-${var.environment}-mq-disk-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "SystemDiskUsed"
  namespace           = "AWS/AmazonMQ"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Amazon MQ disk utilization percentage"

  dimensions = {
    Broker = aws_mq_broker.main.broker_name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-disk-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "mq_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-mq-connection-count"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ConnectionCount"
  namespace           = "AWS/AmazonMQ"
  period              = "300"
  statistic           = "Average"
  threshold           = "1000"
  alarm_description   = "This metric monitors Amazon MQ connection count"

  dimensions = {
    Broker = aws_mq_broker.main.broker_name
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-mq-connections-alarm"
  }
}
