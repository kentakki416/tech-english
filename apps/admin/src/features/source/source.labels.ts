import type { GetSourceResponse, SourceSuggestionErrorCode } from "@repo/api-schema"

import type { BadgeColor } from "@/components/ui/badge/Badge"

/**
 * ソースの表示ラベル。Client Component からも使うので `server-only` を付けない。
 * 値は `@repo/api-schema` の型で検査する（Zod のスキーマは bundle に入れないため import しない）
 */

type SourceLicense = GetSourceResponse["source"]["license_spdx"]

const PERSONAL_USE_LICENSE: Extract<SourceLicense, "LicenseRef-personal-use"> = "LicenseRef-personal-use"

type SourceFetchType = GetSourceResponse["source"]["fetch_type"]

type SourceKind = GetSourceResponse["source"]["kind"]

/**
 * 取得方法の表示名（編集の「収集の状況」に出す）
 */
export const SOURCE_FETCH_TYPE_LABELS: Record<SourceFetchType, string> = {
  github_repository: "GitHub リポジトリ",
  website: "サイト（URL から追加）",
}

/**
 * 種別の表示名（一覧の種別の列と、編集の「収集の状況」に出す）
 */
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  docs: "公式ドキュメント",
  github: "GitHub の文書",
}

/**
 * 一覧と登録の画面の上の [GitHub] [サイト] のボタンの文字
 */
export const SOURCE_FETCH_TYPE_TAB_LABELS: Record<SourceFetchType, string> = {
  github_repository: "GitHub",
  website: "サイト",
}

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

/**
 * 登録の URL を読み込めなかった理由。api の 400 の理由（SourceSuggestionErrorCode）に、URL の形の誤り（invalid_url）・
 * サインインの期限切れ（unauthorized）・そのほか（failed）を足したもの
 */
export type SourceSuggestionFailureReason = SourceSuggestionErrorCode | "failed" | "invalid_url" | "unauthorized"

export const SOURCE_SUGGESTION_FAILURE_MESSAGES: Record<SourceSuggestionFailureReason, string> = {
  failed: "読み込めませんでした。時間をおいて再度お試しください。",
  github_url: "GitHub のリポジトリは GitHub の画面で登録してください。",
  invalid_url: "URL の形が正しくありません。",
  not_repository_url: "GitHub はリポジトリの URL（https://github.com/{owner}/{repo}）を入れてください。",
  repository_not_found: "リポジトリが見つかりませんでした（非公開のリポジトリも同じ表示です）。",
  unauthorized: "サインインの期限が切れました。ページを開き直してサインインしてください。",
  website_unavailable: "サイトのソースはローカルでだけ登録できます。",
}
