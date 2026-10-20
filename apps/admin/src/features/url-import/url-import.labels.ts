import type { PreviewUrlImportResponse } from "@repo/api-schema"

/**
 * URL の取り込みの表示ラベル。Client Component からも使うので `server-only` を付けない。
 * 値の集合は `@repo/api-schema` の型で網羅を検査する（Zod のスキーマは bundle に入れないため import しない）
 */

type UrlImportChunk = PreviewUrlImportResponse["chunks"][number]

type BadgeColor = "dark" | "error" | "info" | "light" | "primary" | "success" | "warning"

export const URL_IMPORT_CHUNK_STATUS_LABELS: Record<UrlImportChunk["status"], { color: BadgeColor, label: string }> = {
  duplicated: { color: "light", label: "同じ内容の問題がある" },
  existing: { color: "info", label: "本文候補がすでにある（生成を優先）" },
  generated_section: { color: "warning", label: "同じ見出しの問題がある" },
  new: { color: "success", label: "本文候補になる" },
  not_candidate: { color: "light", label: "本文候補にならない" },
}

export const CHUNK_REJECT_REASON_LABELS: Record<UrlImportChunk["reject_reasons"][number], string> = {
  not_english: "英語でない",
  not_prose: "文章でない",
  too_long: "長すぎる",
  too_much_code: "コードが多い",
  too_short: "短すぎる",
}

/**
 * 保存すると本文候補になる・生成を優先する塊か（無ければ保存のボタンを押せない）
 */
export const isImportableChunk = (chunk: UrlImportChunk): boolean => chunk.status === "new" || chunk.status === "existing"
