output "schedule_arn" {
  description = "EventBridge Scheduler スケジュールの ARN"
  value       = aws_scheduler_schedule.this.arn
}

output "schedule_name" {
  description = "EventBridge Scheduler スケジュール名"
  value       = aws_scheduler_schedule.this.name
}

output "scheduler_role_arn" {
  description = "scheduler 実行用 IAM role の ARN"
  value       = aws_iam_role.scheduler.arn
}
