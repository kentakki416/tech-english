import type { GetAdminUserResponse } from "@repo/api-schema"

/**
 * ユーザー管理の表示ラベル（一覧・詳細で使う）
 */

const AUTH_PROVIDER_LABELS: Record<string, string> = {
  dev: "dev",
  github: "GitHub",
  google: "Google",
}

/**
 * ログイン方法（auth_accounts.provider）の表示名。知らない値はそのまま出す
 */
export const formatAuthProvider = (provider: string): string => AUTH_PROVIDER_LABELS[provider] ?? provider

/**
 * 名前が無い（null・空白だけ）ときに出す文字
 */
const NO_NAME_LABEL = "（名前なし）"

/**
 * 名前があるか（null・空白だけなら false。Google の名前は空文字のことがある）
 */
export const hasUserName = (name: string | null): name is string => (name?.trim() ?? "") !== ""

/**
 * ユーザーの名前の表示。無ければ「（名前なし）」
 */
export const formatUserName = (name: string | null): string => (hasUserName(name) ? name.trim() : NO_NAME_LABEL)

type GoalMetric = NonNullable<NonNullable<GetAdminUserResponse["stats"]["goal"]>["weekly_metric"]>

/**
 * 週の目標の単位（解いた問題の数 / 学習した分）
 */
export const GOAL_METRIC_UNITS: Record<GoalMetric, string> = {
  minutes: "分",
  passages: "問",
}
