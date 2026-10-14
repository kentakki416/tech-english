import { Dialog } from "@/components/ui/Dialog"

/**
 * 提出の確認。未回答があれば件数と「不正解として採点」を伝える。
 * 送信中は両方のボタンを無効にし、失敗したらダイアログの中に理由を出す（回答は端末に残っているので再送できる）
 */
export function SubmitConfirmDialog({
  errorMessage,
  isSubmitting,
  unansweredCount,
  onCancel,
  onSubmit,
}: {
  errorMessage: string | null
  isSubmitting: boolean
  unansweredCount: number
  onCancel: () => void
  onSubmit: () => void
}) {
  const hasUnanswered = unansweredCount > 0
  return (
    <Dialog labelledBy="submit-confirm-title">
      <h2 className="text-lg font-semibold text-fg" id="submit-confirm-title">
        {hasUnanswered ? `未回答の設問が ${unansweredCount} 問あります` : "回答を提出しますか？"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        {hasUnanswered ? "未回答の設問は不正解として採点されます。" : ""}提出すると回答は変更できません。
      </p>
      {errorMessage && <p className="mt-3 text-sm text-wrong" role="alert">{errorMessage}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          className="h-10 rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-amber/60 disabled:pointer-events-none disabled:opacity-50"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          {hasUnanswered ? "戻って回答する" : "戻る"}
        </button>
        <button
          autoFocus
          className="grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-raised disabled:cursor-wait disabled:opacity-70"
          disabled={isSubmitting}
          onClick={onSubmit}
          type="button"
        >
          {isSubmitting ? "提出しています…" : "提出する"}
        </button>
      </div>
    </Dialog>
  )
}
