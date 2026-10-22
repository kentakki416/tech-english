import type { GetSourceResponse } from "@repo/api-schema"

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

type SourceCollectionRun = NonNullable<GetSourceResponse["latest_collection_run"]>

export type SourceCollectionRunStatus = SourceCollectionRun["status"]

type BadgeColor = "dark" | "error" | "info" | "light" | "primary" | "success" | "warning"

/**
 * 収集の状態のバッジ（queued と running はどちらも「収集中」）
 */
export const SOURCE_COLLECTION_RUN_STATUS_LABELS: Record<SourceCollectionRunStatus, { color: BadgeColor; label: string }> = {
  completed: { color: "success", label: "完了" },
  failed: { color: "error", label: "失敗" },
  limit_reached: { color: "warning", label: "上限で打ち切り" },
  queued: { color: "info", label: "収集中" },
  rate_limited: { color: "warning", label: "rate limit で打ち切り" },
  running: { color: "info", label: "収集中" },
  up_to_date: { color: "light", label: "変更なし" },
}
