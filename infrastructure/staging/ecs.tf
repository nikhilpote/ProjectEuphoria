# ── ECS Cluster ─────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.env}"

  setting {
    name  = "containerInsights"
    value = "disabled" # Enable in production
  }
}

# ── IAM: EC2 Instance Role (for ECS agent) ─────────────────────
resource "aws_iam_role" "ecs_instance" {
  name = "${var.project}-${var.env}-ecs-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_instance" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "ecs_instance_ssm" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ecs" {
  name = "${var.project}-${var.env}-ecs-instance"
  role = aws_iam_role.ecs_instance.name
}

# ── IAM: ECS Task Execution Role (pull images, write logs) ─────
resource "aws_iam_role" "ecs_execution" {
  name = "${var.project}-${var.env}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ── IAM: ECS Task Role (S3 access for the app) ─────────────────
resource "aws_iam_role" "ecs_task" {
  name = "${var.project}-${var.env}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3-media-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = [
        "arn:aws:s3:::${var.media_bucket}",
        "arn:aws:s3:::${var.media_bucket}/*"
      ]
    }]
  })
}

# ── Launch Template for ECS EC2 instances ──────────────────────
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

resource "aws_launch_template" "ecs" {
  name_prefix   = "${var.project}-${var.env}-ecs-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = var.ec2_instance_type
  key_name      = var.ssh_key_name

  iam_instance_profile {
    arn = aws_iam_instance_profile.ecs.arn
  }

  vpc_security_group_ids = [aws_security_group.ecs.id]

  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
    echo "ECS_ENABLE_CONTAINER_METADATA=true" >> /etc/ecs/ecs.config
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project}-${var.env}-ecs-host"
    }
  }

  lifecycle { create_before_destroy = true }
}

# ── Auto Scaling Group ─────────────────────────────────────────
resource "aws_autoscaling_group" "ecs" {
  name_prefix         = "${var.project}-${var.env}-ecs-"
  min_size            = var.ec2_min_count
  max_size            = var.ec2_max_count
  desired_capacity    = var.ec2_min_count
  vpc_zone_identifier = aws_subnet.public[*].id

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = true
    propagate_at_launch = true
  }

  lifecycle { create_before_destroy = true }
}

# ── Capacity Provider ──────────────────────────────────────────
resource "aws_ecs_capacity_provider" "ec2" {
  name = "${var.project}-${var.env}-ec2"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.ecs.arn
    managed_termination_protection = "DISABLED"

    managed_scaling {
      status                    = "ENABLED"
      target_capacity           = 100
      minimum_scaling_step_size = 1
      maximum_scaling_step_size = 1
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.ec2.name]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
  }
}

# ── CloudWatch Log Group ───────────────────────────────────────
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}-${var.env}-api"
  retention_in_days = 1 # minimum allowed (2 not valid — 1, 3, 5, 7...)
}

# ── Task Definition ────────────────────────────────────────────
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-${var.env}-api"
  network_mode             = "bridge"
  requires_compatibilities = ["EC2"]
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.api.repository_url}:latest"
    essential = true
    cpu       = var.ecs_task_cpu
    memory    = var.ecs_task_memory

    portMappings = [{
      containerPort = 3000
      hostPort      = 0 # dynamic port mapping for bridge mode
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "staging" },
      { name = "PORT", value = "3000" },
      { name = "API_PREFIX", value = "api/v1" },
      { name = "DATABASE_URL", value = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${var.db_name}?uselibpqcompat=true&sslmode=require" },
      { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379" },
      { name = "STORAGE_PROVIDER", value = "s3" },
      { name = "S3_BUCKET", value = var.media_bucket },
      { name = "S3_REGION", value = var.region },
      { name = "S3_PUBLIC_URL", value = "https://${var.media_bucket}.s3.${var.region}.amazonaws.com" },
      { name = "LOG_LEVEL", value = "debug" },
      { name = "FEATURE_FLAGS_REDIS_PREFIX", value = "ff:staging:" },
      { name = "THROTTLE_TTL_SECONDS", value = "60" },
      { name = "THROTTLE_LIMIT", value = "100" },
      { name = "JWT_SECRET", value = random_password.jwt_secret.result },
      { name = "JWT_REFRESH_SECRET", value = random_password.jwt_refresh_secret.result },
      { name = "JWT_ACCESS_EXPIRES_IN", value = "15m" },
      { name = "JWT_REFRESH_EXPIRES_IN", value = "30d" },
      { name = "ADMIN_JWT_SECRET", value = random_password.admin_jwt_secret.result },
      { name = "ANSWER_ENCRYPTION_KEY", value = random_password.answer_encryption_key.result },
      # OAuth placeholders — replace with real values when ready
      { name = "GOOGLE_CLIENT_ID", value = "placeholder" },
      { name = "GOOGLE_CLIENT_SECRET", value = "placeholder" },
      { name = "GOOGLE_CALLBACK_URL", value = "http://localhost/api/v1/auth/google/callback" },
      { name = "APPLE_CLIENT_ID", value = "placeholder" },
      { name = "APPLE_TEAM_ID", value = "placeholder" },
      { name = "APPLE_KEY_ID", value = "placeholder" },
      { name = "APPLE_PRIVATE_KEY_PATH", value = "/tmp/placeholder.p8" },
      { name = "APPLE_CALLBACK_URL", value = "http://localhost/api/v1/auth/apple/callback" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

# ── ECS Service ────────────────────────────────────────────────
resource "aws_ecs_service" "api" {
  name            = "${var.project}-${var.env}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.ecs_desired_count

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  deployment_minimum_healthy_percent = 0   # staging: allow full replacement
  deployment_maximum_percent         = 200

  ordered_placement_strategy {
    type  = "spread"
    field = "attribute:ecs.availability-zone"
  }

  depends_on = [aws_lb_listener.http]
}
