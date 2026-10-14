import Link from "next/link"

import { Dialog } from "@/components/ui/Dialog"

/**
 * 解答中に期限（開始から 24 時間）を過ぎたとき・提出が期限切れで断られたときのダイアログ。
 * この挑戦はもう提出できないので閉じるボタンは置かず、問題の開始確認から新しく始めてもらう
 */
export function ExpiredDialog({ passageId }: { passageId: number }) {
  return (
    <Dialog labelledBy="expired-title">
      <h2 className="text-lg font-semibold text-fg" id="expired-title">この挑戦は期限切れになりました</h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        開始から 24 時間が過ぎたため、この挑戦は提出できません。問題を開くと、新しく挑戦できます。
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link
          className="grid h-10 place-items-center rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-amber/60"
          href="/passages"
        >
          問題一覧に戻る
        </Link>
        <Link
          autoFocus
          className="grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60"
          href={`/passages/${passageId}`}
        >
          問題を開く
        </Link>
      </div>
    </Dialog>
  )
}
