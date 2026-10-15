import type { AdminPassageStatus, GetAdminPassageResponse } from "@repo/api-schema"

/**
 * 問題の表示ラベル。Client Component からも使うので `server-only` を付けない。
 * 値の集合は `@repo/api-schema` の型で網羅を検査する（Zod のスキーマは bundle に入れないため import しない）
 */

export type AdminPassageDifficulty = NonNullable<GetAdminPassageResponse["difficulty"]>

export type AdminQuestionType = GetAdminPassageResponse["questions"][number]["type"]

/**
 * 読み上げの音声（詳細の audio）。下書きなどで音声の行も無ければ詳細の audio が null なので、ここでは null を除く
 */
export type AdminPassageAudio = NonNullable<GetAdminPassageResponse["audio"]>

export type AdminPassageAudioStatus = AdminPassageAudio["status"]

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

/**
 * 読み上げの音声の状態のバッジ。色は問題の状態のラベル（収集済み light・生成中 info）とそろえる
 */
export const AUDIO_STATUS_LABELS: Record<AdminPassageAudioStatus, { color: BadgeColor, label: string }> = {
  failed: { color: "error", label: "失敗" },
  generating: { color: "info", label: "生成中" },
  pending: { color: "light", label: "準備中" },
  ready: { color: "success", label: "作成済み" },
}

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

/**
 * 選択肢の記号（選択肢は 4 つ。生成と保存で 4 つと検査している）
 */
export const CHOICE_LETTERS = ["A", "B", "C", "D"] as const
