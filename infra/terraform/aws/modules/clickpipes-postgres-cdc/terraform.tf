terraform {
  required_version = ">= 1.11" # ephemeral variable と password_wo (write-only 引数) に必要
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.4"
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
