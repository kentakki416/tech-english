/**
 * 設問の「訳」。見た目は段落の「訳」と同じで、段落と違いホバーしなくても常に出す（設問は 1 つずつしか見えず、置き場所を探させないため）
 */
export function QuestionTranslationToggle({
  isTranslated,
  onToggle,
}: {
  isTranslated: boolean
  onToggle: () => void
}) {
  return (
    <button
      aria-label={isTranslated ? "設問の和訳を隠す" : "設問の和訳を表示"}
      aria-pressed={isTranslated}
      className={`shrink-0 rounded border px-1.5 py-0.5 font-ui text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
        isTranslated ? "border-amber/50 bg-amber-wash text-amber" : "border-line-strong text-fg-muted hover:text-fg"
      }`}
      onClick={onToggle}
      type="button"
    >
      訳
    </button>
  )
}
