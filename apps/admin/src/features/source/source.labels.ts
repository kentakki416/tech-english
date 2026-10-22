import type { GetSourceResponse } from "@repo/api-schema"

import type { BadgeColor } from "@/components/ui/badge/Badge"

/**
 * ソースの表示ラベル。Client Component からも使うので `server-only` を付けない。
 * 値は `@repo/api-schema` の型で検査する（Zod のスキーマは bundle に入れないため import しない）
 */

type SourceLicense = GetSourceResponse["source"]["license_spdx"]

const PERSONAL_USE_LICENSE: Extract<SourceLicense, "LicenseRef-personal-use"> = "LicenseRef-personal-use"

/**
 * ライセンスの表示名。個人の学習用だけ日本語の名前にし、ほかは SPDX 識別子のまま出す
 */
export const formatLicenseLabel = (license: string): string =>
  license === PERSONAL_USE_LICENSE ? "個人の学習用（ライセンスなし）" : license

export type SourceCollectionRun = NonNullable<GetSourceResponse["latest_collection_run"]>

export type SourceCollectionRunStatus = SourceCollectionRun["status"]

/**
 * 収集の状態のバッジ（queued と running はどちらも「収集中」）
 */
export const SOURCE_COLLECTION_RUN_STATUS_LABELS: Record<SourceCollectionRunStatus, { color: BadgeColor, label: string }> = {
  completed: { color: "success", label: "完了" },
  failed: { color: "error", label: "失敗" },
  limit_reached: { color: "warning", label: "上限で打ち切り" },
  queued: { color: "info", label: "収集中" },
  rate_limited: { color: "warning", label: "rate limit で打ち切り" },
  running: { color: "info", label: "収集中" },
  up_to_date: { color: "light", label: "変更なし" },
}

/**
 * 今すぐ収集の依頼が通らなかった理由。running はほかの収集が実行中、disabled は無効のソース、
 * unavailable はこの環境に今すぐ収集が無い（api の SOURCE_COLLECTION_TYPE=none）、failed はそのほか
 */
export type SourceCollectionRequestFailureReason = "disabled" | "failed" | "running" | "unavailable"

export const SOURCE_COLLECTION_REQUEST_FAILURE_MESSAGES: Record<SourceCollectionRequestFailureReason, string> = {
  disabled: "無効のソースは収集しません。有効にして保存してから押してください。",
  failed: "収集を始められませんでした。時間をおいてもう一度押してください。",
  running: "ほかの収集が実行中です。終わるまで待ってください。",
  unavailable: "この環境では今すぐ収集を使えません（worker がありません）。",
}
