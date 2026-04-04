# ── ALB Security Group ──────────────────────────────────────────
resource "aws_security_group" "alb" {
  name_prefix = "${var.project}-${var.env}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "ALB - allow HTTP/HTTPS from internet"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-${var.env}-alb-sg" }

  lifecycle { create_before_destroy = true }
}

# ── ECS Instances Security Group ───────────────────────────────
resource "aws_security_group" "ecs" {
  name_prefix = "${var.project}-${var.env}-ecs-"
  vpc_id      = aws_vpc.main.id
  description = "ECS instances - allow traffic from ALB"

  # Ephemeral port range from ALB (bridge mode dynamic port mapping)
  ingress {
    from_port       = 32768
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # SSH for debugging (staging only)
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  # ECS agent + container pulls + S3 + OAuth
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-${var.env}-ecs-sg" }

  lifecycle { create_before_destroy = true }
}

# ── RDS Security Group ─────────────────────────────────────────
resource "aws_security_group" "rds" {
  name_prefix = "${var.project}-${var.env}-rds-"
  vpc_id      = aws_vpc.main.id
  description = "RDS - allow PostgreSQL from ECS"

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = { Name = "${var.project}-${var.env}-rds-sg" }

  lifecycle { create_before_destroy = true }
}

# ── Redis Security Group ───────────────────────────────────────
resource "aws_security_group" "redis" {
  name_prefix = "${var.project}-${var.env}-redis-"
  vpc_id      = aws_vpc.main.id
  description = "ElastiCache - allow Redis from ECS"

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = { Name = "${var.project}-${var.env}-redis-sg" }

  lifecycle { create_before_destroy = true }
}
