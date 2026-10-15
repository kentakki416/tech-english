import type { AdminPassageStatus } from "@repo/api-schema"

import Badge from "@/components/ui/badge/Badge"
import { PASSAGE_STATUS_LABELS } from "@/features/passage/passage.labels"

/**
 * 公開していない問題（非公開に戻した・下書きなど）をまとめて出す文字。ダッシュボードでは公開中かどうかだけを見分ける
 */
const UNPUBLISHED_LABEL = "非公開"

/**
 * 問題ごとの成績・問題の分析の状態のバッジ（公開中は緑の「公開」、それ以外は灰色の「非公開」）
 */
export function PassageStatsStatusBadge({ status }: { status: AdminPassageStatus }) {
  const isPublished = status === "published"
  return (
    <Badge color={isPublished ? "success" : "light"} size="sm">
      {isPublished ? PASSAGE_STATUS_LABELS.published : UNPUBLISHED_LABEL}
    </Badge>
  )
}
