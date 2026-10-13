/**
 * スマホ幅（1024px 未満）の設問シート。閉じた状態は下端のバー（高さ 64px）、バーを押すと画面の 78% まで開く。
 * 開くと設問パネル（children）と「提出する」を出す
 */
export function QuestionSheet({
  answeredCount,
  children,
  currentIndex,
  isInert = false,
  isOpen,
  questionCount,
  onOpenSubmitConfirm,
  onToggle,
}: {
  answeredCount: number
  children: React.ReactNode
  currentIndex: number
  /**
   * 一時停止中はキーボードでも操作できないようにする
   */
  isInert?: boolean
  isOpen: boolean
  questionCount: number
  onOpenSubmitConfirm: () => void
  onToggle: () => void
}) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgb(0_0_0/0.4)] transition-[height] duration-300 lg:hidden ${
        isOpen ? "h-[78dvh]" : "h-16"
      }`}
      inert={isInert}
    >
      <button
        aria-controls="question-sheet-body"
        aria-expanded={isOpen}
        className="flex h-16 w-full shrink-0 items-center gap-3 px-4 text-left outline-none focus-visible:bg-raised"
        onClick={onToggle}
        type="button"
      >
        <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong" />
        <span className="text-sm font-semibold text-fg">設問</span>
        <span className="text-sm text-fg-muted tabular-nums">回答 {answeredCount} / {questionCount}</span>
        <span className="ml-auto text-sm text-fg-muted">{isOpen ? "本文に戻る" : `Q${currentIndex + 1} を開く`}</span>
      </button>
      {isOpen && (
        <div className="flex min-h-0 flex-1 flex-col" id="question-sheet-body">
          <div className="min-h-0 flex-1">{children}</div>
          <div className="border-t border-line p-3">
            <button
              className="h-11 w-full rounded-lg bg-amber text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60"
              onClick={onOpenSubmitConfirm}
              type="button"
            >
              提出する
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
