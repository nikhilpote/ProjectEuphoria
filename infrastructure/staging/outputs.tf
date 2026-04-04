output "alb_dns" {
  description = "ALB DNS name — use this to access the API"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL — push Docker images here"
  value       = aws_ecr_repository.api.repository_url
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "admin_bucket" {
  description = "S3 bucket for admin SPA"
  value       = aws_s3_bucket.admin.bucket
}

output "db_password" {
  description = "Generated database password"
  value       = random_password.db.result
  sensitive   = true
}

output "deploy_commands" {
  description = "Commands to deploy after terraform apply"
  value       = <<-EOT

    === DEPLOY STEPS ===

    1. Build & push Docker image (ARM64 for Graviton):
       aws ecr get-login-password --region ${var.region} | docker login --username AWS --password-stdin ${aws_ecr_repository.api.repository_url}
       docker buildx build --platform linux/arm64 -f apps/api/Dockerfile -t ${aws_ecr_repository.api.repository_url}:latest --push .

    2. Build & upload admin SPA:
       VITE_API_URL="" npm run build -w apps/admin
       aws s3 sync apps/admin/dist/ s3://${aws_s3_bucket.admin.bucket}/ --delete

    3. Force new ECS deployment:
       aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.api.name} --force-new-deployment --region ${var.region}

    4. Access:
       API:    http://${aws_lb.main.dns_name}/health
       Admin:  http://${aws_s3_bucket.admin.bucket}.s3-website.${var.region}.amazonaws.com

  EOT
}
