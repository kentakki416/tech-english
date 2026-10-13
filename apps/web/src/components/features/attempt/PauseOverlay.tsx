/**
 * 一時停止中の表示。本文と設問を覆い隠す（透かさない）。
 * 開いたままの単語のカード（z-50）も隠れるよう、カードより上に重ねる
 */
export function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <div className="absolute inset-0 z-55 grid place-items-center bg-canvas px-6">
      <div className="max-w-sm text-center">
        <span aria-hidden className="mx-auto block size-4 rounded-[4px] border border-line-strong bg-heat-0" />
        <h2 className="mt-5 text-lg font-semibold text-fg">一時停止中</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">本文と設問を隠しています。再開するとタイマーが動きます。</p>
        <button
          autoFocus
          className="mt-6 h-10 rounded-lg bg-amber px-5 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60"
          onClick={onResume}
          type="button"
        >
          再開する
        </button>
      </div>
    </div>
  )
}
