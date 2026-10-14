import type { AdminPassageStatus, GetAdminPassageResponse } from "@repo/api-schema"

/**
 * 問題の表示ラベル。Client Component からも使うので `server-only` を付けない。
 * 値の集合は `@repo/api-schema` の型で網羅を検査する（Zod のスキーマは bundle に入れないため import しない）
 */

export type AdminPassageDifficulty = NonNullable<GetAdminPassageResponse["difficulty"]>

export type AdminQuestionType = GetAdminPassageResponse["questions"][number]["type"]

type BadgeColor = "dark" | "error" | "info" | "light" | "primary" | "success" | "warning"

export const PASSAGE_STATUS_LABELS: Record<AdminPassageStatus, string> = {
  collected: "収集済み",
  draft: "下書き",
  failed: "失敗",
  generating: "生成中",
  published: "公開",
  rejected: "却下",
}

/**
 * 状態のバッジの色（README の「状態のバッジの色」）
 */
export const PASSAGE_STATUS_BADGE_COLORS: Record<AdminPassageStatus, BadgeColor> = {
  collected: "light",
  draft: "primary",
  failed: "error",
  generating: "info",
  published: "success",
  rejected: "dark",
}

/**
 * 件数のカードの並び（下書き・公開・収集済み・生成中・却下・失敗）
 */
export const PASSAGE_STATUS_ORDER = [
  "draft",
  "published",
  "collected",
  "generating",
  "rejected",
  "failed",
] as const satisfies readonly AdminPassageStatus[]

export const PASSAGE_DIFFICULTY_LABELS: Record<AdminPassageDifficulty, string> = {
  1: "Easy",
  2: "Normal",
  3: "Hard",
}

export const PASSAGE_DIFFICULTY_ORDER = [1, 2, 3] as const satisfies readonly AdminPassageDifficulty[]

export const QUESTION_TYPE_LABELS: Record<AdminQuestionType, string> = {
  detail: "詳細",
  inference: "推論",
  main_idea: "要旨",
  purpose: "筆者の意図",
  vocabulary: "文脈での語義",
}

/**
 * 設問の種類の選択肢の並び（要旨・詳細・文脈での語義・推論・筆者の意図）
 */
export const QUESTION_TYPE_ORDER = [
  "main_idea",
  "detail",
  "vocabulary",
  "inference",
  "purpose",
] as const satisfies readonly AdminQuestionType[]
