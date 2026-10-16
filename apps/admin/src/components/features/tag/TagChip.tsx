import type { GetTagListResponse } from "@repo/api-schema"

export type TagColor = GetTagListResponse["tags"][number]["color"]

/**
 * 色ごとのクラス。chip はタグ（ライト：薄い背景と濃い文字、ダーク：半透明の背景と明るい文字）、swatch は色の見本の丸。
 * Tailwind はソースに書かれたクラス名しか CSS にしないため、色ごとにクラス名をそのまま書く
 */
export const TAG_COLOR_CLASSES: Record<TagColor, { chip: string, swatch: string }> = {
  amber: { chip: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30", swatch: "bg-amber-500" },
  blue: { chip: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:ring-blue-500/30", swatch: "bg-blue-500" },
  emerald: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/30", swatch: "bg-emerald-500" },
  lime: { chip: "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-500/15 dark:text-lime-400 dark:ring-lime-500/30", swatch: "bg-lime-500" },
  orange: { chip: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:ring-orange-500/30", swatch: "bg-orange-500" },
  pink: { chip: "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/15 dark:text-pink-400 dark:ring-pink-500/30", swatch: "bg-pink-500" },
  rose: { chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30", swatch: "bg-rose-500" },
  sky: { chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-400 dark:ring-sky-500/30", swatch: "bg-sky-500" },
  teal: { chip: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-400 dark:ring-teal-500/30", swatch: "bg-teal-500" },
  violet: { chip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-500/30", swatch: "bg-violet-500" },
}

/**
 * 色付きのタグ。isMuted は選んでいないタグ（ソースのタグの選択）を薄く出す
 */
export function TagChip({ color, isMuted = false, name }: { color: TagColor, isMuted?: boolean, name: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium ring-1 ring-inset transition-opacity ${TAG_COLOR_CLASSES[color].chip} ${isMuted ? "opacity-60" : ""}`}
    >
      {name}
    </span>
  )
}
