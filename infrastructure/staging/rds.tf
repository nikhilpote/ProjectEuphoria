# ── Random password for DB ──────────────────────────────────────
resource "random_password" "db" {
  length  = 32
  special = false # avoid shell escaping issues in DATABASE_URL
}

# ── RDS PostgreSQL ─────────────────────────────────────────────
resource "aws_db_instance" "main" {
  identifier     = "${var.project}-${var.env}"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = 100 # autoscale up to 100GB
  storage_type          = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  multi_az               = var.rds_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  backup_retention_period = 7
  backup_window           = "19:00-20:00"      # 12:30am-1:30am IST
  maintenance_window      = "sun:20:00-sun:21:00"

  skip_final_snapshot       = true # staging only — change for production
  delete_automated_backups  = true
  deletion_protection       = false

  performance_insights_enabled = false # t4g.micro doesn't support it

  tags = { Name = "${var.project}-${var.env}-postgres" }
}
