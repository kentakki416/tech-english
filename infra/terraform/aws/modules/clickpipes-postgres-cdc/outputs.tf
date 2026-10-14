output "clickpipe_state" {
  description = "ClickPipe の状態 (Running / Snapshot / Failed など)。Failed でも apply は成功するため、apply 後に確認する"
  value       = clickhouse_clickpipe.this.state
}

output "ssh_key_status" {
  description = "SSH の鍵の検証状態 (pending / active / failed)"
  value       = clickhouse_clickpipes_ssh_key.bastion.status
}

output "bastion_public_ip" {
  description = "bastion の IP (EIP)"
  value       = aws_eip.bastion.public_ip
}
