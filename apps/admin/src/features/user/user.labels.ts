import type { GetAdminUserResponse } from "@repo/api-schema"

/**
 * ユーザー管理の表示ラベル。Client Component からも使うので `server-only` を付けない
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

type GoalMetric = NonNullable<NonNullable<GetAdminUserResponse["stats"]["goal"]>["weekly_metric"]>

/**
 * 週の目標の単位（解いた問題の数 / 学習した分）
 */
export const GOAL_METRIC_UNITS: Record<GoalMetric, string> = {
  minutes: "分",
  passages: "問",
}
