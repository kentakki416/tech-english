/**
 * 名前は「効果音」に固定し、オン / オフは aria-pressed で伝える（文字を出さないときも読み上げで分かるように aria-label を付ける）
 */
export function SoundEffectToggle({
  className = "",
  isEnabled,
  showsLabel,
  onToggle,
}: {
  className?: string
  isEnabled: boolean
  showsLabel: boolean
  onToggle: () => void
}) {
  return (
    <button
      aria-label="効果音"
      aria-pressed={isEnabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-raised hover:text-fg ${className}`}
      title={isEnabled ? "効果音をオフにする" : "効果音をオンにする"}
      type="button"
      onClick={onToggle}
    >
      <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {isEnabled ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6M22 9l-6 6" />}
      </svg>
      {showsLabel && <span aria-hidden className="hidden sm:inline">効果音</span>}
    </button>
  )
}
