# =============================================================================
# API Gateway HTTP API ($default ルートで Lambda alias に全リクエストを流す) + 独自ドメイン
# =============================================================================
# ALB と違い時間課金が無い (リクエスト数の従量のみ)。
# 設計: docs/spec/minimal-deploy/README.md「api を Lambda で動かす」

resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"

  # 独自ドメイン以外 (execute-api の URL) からは呼べないようにする
  disable_execute_api_endpoint = true

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_alias_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000 # HTTP API の上限
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name}"
  retention_in_days = var.log_retention_in_days

  tags = var.tags
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      httpMethod       = "$context.httpMethod"
      integrationError = "$context.integrationErrorMessage"
      ip               = "$context.identity.sourceIp"
      path             = "$context.path"
      protocol         = "$context.protocol"
      requestId        = "$context.requestId"
      requestTime      = "$context.requestTime"
      responseLatency  = "$context.responseLatency"
      responseLength   = "$context.responseLength"
      status           = "$context.status"
    })
  }

  # express-rate-limit (in-memory) は Lambda では実質効かないため、ステージ全体で上限をかける
  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }

  tags = var.tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowInvokeFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  qualifier     = var.lambda_alias_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_apigatewayv2_domain_name" "this" {
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  domain_name = aws_apigatewayv2_domain_name.this.id
  stage       = aws_apigatewayv2_stage.default.id
}
