# ── VPC ─────────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-${var.env}-vpc" }
}

# ── Internet Gateway ───────────────────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-${var.env}-igw" }
}

# ── Availability Zones ─────────────────────────────────────────
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

# ── Public Subnets (ALB + ECS in staging, no NAT needed) ───────
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-${var.env}-public-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-${var.env}-public-rt" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── Database Subnets (RDS, Redis) ──────────────────────────────
resource "aws_subnet" "database" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 20}.0/24"
  availability_zone = local.azs[count.index]

  tags = { Name = "${var.project}-${var.env}-db-${local.azs[count.index]}" }
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.env}-db-subnets"
  subnet_ids = aws_subnet.database[*].id

  tags = { Name = "${var.project}-${var.env}-db-subnet-group" }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project}-${var.env}-redis-subnets"
  subnet_ids = aws_subnet.database[*].id
}
