# =============================================================================
# コンテナイメージの Lambda 関数 + alias live
# =============================================================================
# - image_uri / environment は deploy workflow が正本。Terraform は作成時の値だけを入れる
# - alias live の向き先 (function_version) も deploy workflow が切り替える (切り戻しも alias の付け替え)
# 設計: docs/spec/minimal-deploy/README.md「api を Lambda で動かす」

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_in_days

  tags = var.tags
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  package_type  = "Image"
  image_uri     = var.image_uri
  role          = aws_iam_role.lambda.arn
  architectures = ["x86_64"] # GitHub Actions が linux/amd64 で build するため
  memory_size   = var.memory_size
  timeout       = var.timeout
  publish       = true

  reserved_concurrent_executions = var.reserved_concurrent_executions

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this.name
  }

  # image_uri と environment は deploy workflow (deploy-aws-min.yml) が正本。
  # Terraform が古い値で上書きしないよう無視する。
  lifecycle {
    ignore_changes = [environment, image_uri]
  }

  tags = var.tags

  depends_on = [aws_iam_role_policy_attachment.basic_execution]
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  function_name    = aws_lambda_function.this.function_name
  function_version = aws_lambda_function.this.version

  # どの version に向けるかは deploy workflow が決める (切り戻しも alias の付け替えで行う)
  lifecycle {
    ignore_changes = [function_version]
  }
}
