# ── ElastiCache Redis ───────────────────────────────────────────
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project}-${var.env}"
  description          = "Euphoria ${var.env} Redis"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = 1 + var.redis_num_replicas # 1 primary + 0 replicas for staging
  parameter_group_name = "default.redis7"

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = var.redis_num_replicas > 0
  multi_az_enabled           = var.redis_num_replicas > 0

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false # TLS adds latency; staging doesn't need it

  snapshot_retention_limit = 0 # no backups for staging
  maintenance_window       = "sun:21:00-sun:22:00"

  tags = { Name = "${var.project}-${var.env}-redis" }
}
