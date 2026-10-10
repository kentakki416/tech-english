output "api_id" {
  description = "HTTP API の ID"
  value       = aws_apigatewayv2_api.this.id
}

output "target_domain_name" {
  description = "独自ドメインの向き先 (Route53 の alias レコードの name に使う)"
  value       = aws_apigatewayv2_domain_name.this.domain_name_configuration[0].target_domain_name
}

output "hosted_zone_id" {
  description = "独自ドメインの向き先の hosted zone ID (Route53 の alias レコードの zone_id に使う)"
  value       = aws_apigatewayv2_domain_name.this.domain_name_configuration[0].hosted_zone_id
}
