import { DIFFICULTY_LABELS, DIFFICULTY_ORDER, type PassageDifficulty } from "./labels"

export function DifficultyMeter({ level, showLabel = true }: { level: PassageDifficulty, showLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
      <span aria-hidden className="flex items-end gap-0.5">
        {DIFFICULTY_ORDER.map(step => (
          <span
            className={`w-1 rounded-sm ${step <= level ? "bg-amber" : "bg-line-strong"}`}
            key={step}
            style={{ height: `${6 + step * 3}px` }}
          />
        ))}
      </span>
      {showLabel ? DIFFICULTY_LABELS[level] : <span className="sr-only">{DIFFICULTY_LABELS[level]}</span>}
    </span>
  )
}
