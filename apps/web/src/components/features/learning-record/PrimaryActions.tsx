import Link from "next/link"

/**
 * マイページの主要な導線（問題一覧・ランダムに 1 問）。ランダムは study-reminder の通知と同じ入口
 */
export function PrimaryActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        className="grid h-10 place-items-center rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-amber/60"
        href="/passages"
      >
        問題一覧
      </Link>
      <Link
        className="grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        href="/passages/random"
      >
        ランダムに 1 問解く
      </Link>
    </div>
  )
}
