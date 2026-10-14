# =============================================================================
# Terraform & Provider Configuration
# =============================================================================

terraform {
  required_version = ">= 1.11" # password_wo (write-only 引数) と ephemeral resource に必要

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    clickhouse = {
      source  = "ClickHouse/clickhouse"
      version = "~> 3.38"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

/**
 * provider は、ClickHouse のリソースが 0 個でも空でない認証情報を要求する（API は呼ばない）。
 * enable_data_warehouse = false の環境で secret を置かずに plan / apply を通すため、
 * 未設定なら "unused" を渡す。coalesce は null と空文字の両方を飛ばす
 * （GitHub の secret が未設定なら TF_VAR_* は空文字になる）。
 */
provider "clickhouse" {
  organization_id = coalesce(var.clickhouse_org_id, "unused")
  token_key       = coalesce(var.clickhouse_token_key, "unused")
  token_secret    = coalesce(var.clickhouse_token_secret, "unused")
}
