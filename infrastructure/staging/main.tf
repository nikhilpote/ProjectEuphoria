terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment after first apply to migrate state to S3
  # backend "s3" {
  #   bucket         = "euphoria-terraform-state"
  #   key            = "staging/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "euphoria-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "euphoria"
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}
