output "function_name" {
  description = "Lambda 関数名"
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "Lambda 関数の ARN (version / alias なし)"
  value       = aws_lambda_function.this.arn
}

output "alias_name" {
  description = "alias 名 (live)。API Gateway からはこの alias を呼ぶ"
  value       = aws_lambda_alias.live.name
}

output "alias_arn" {
  description = "alias live の ARN"
  value       = aws_lambda_alias.live.arn
}

output "alias_invoke_arn" {
  description = "alias live の invoke ARN (API Gateway の統合先)"
  value       = aws_lambda_alias.live.invoke_arn
}

output "role_arn" {
  description = "Lambda 実行ロールの ARN"
  value       = aws_iam_role.lambda.arn
}
