terraform {
  required_version = ">= 1.11" # password_wo (write-only 引数) と ephemeral variable に必要
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.4"
    }
  }
}
