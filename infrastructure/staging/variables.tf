variable "region" {
  default = "ap-south-1"
}

variable "project" {
  default = "euphoria"
}

variable "env" {
  default = "staging"
}

# ── Compute ────────────────────────────────────────────────────
variable "ec2_instance_type" {
  description = "EC2 instance type for ECS hosts"
  default     = "t4g.small" # Production: c6g.xlarge
}

variable "ec2_min_count" {
  default = 1
}

variable "ec2_max_count" {
  default = 2
}

variable "ecs_task_cpu" {
  default = 512 # Production: 1024
}

variable "ecs_task_memory" {
  default = 900 # Production: 2048 (leave headroom on 2GB instance)
}

variable "ecs_desired_count" {
  default = 1 # Production: 4
}

# ── Database ───────────────────────────────────────────────────
variable "rds_instance_class" {
  default = "db.t4g.micro" # Production: db.t4g.medium
}

variable "rds_multi_az" {
  default = false # Production: true
}

variable "rds_allocated_storage" {
  default = 20 # Production: 100
}

variable "db_name" {
  default = "euphoria_staging"
}

variable "db_username" {
  default = "euphoria"
}

# ── Redis ──────────────────────────────────────────────────────
variable "redis_node_type" {
  default = "cache.t4g.micro" # Production: cache.r7g.large
}

variable "redis_num_replicas" {
  default = 0 # Production: 1
}

# ── S3 ─────────────────────────────────────────────────────────
variable "media_bucket" {
  default = "euphoria-media-prod"
}

# ── SSH ────────────────────────────────────────────────────────
variable "ssh_key_name" {
  description = "EC2 key pair name for SSH access"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR block allowed to SSH (your IP)"
  default     = "0.0.0.0/0" # CHANGE THIS to your IP/32
}
