import { DIFFICULTY_LABELS, type MockDifficulty, type MockSourceKind, SOURCE_KIND_LABELS } from "@/libs/mock-data"

/**
 * キーボードショートカットのキー表示
 */
export function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-b-2 border-line-strong bg-raised px-1 font-code text-[11px] leading-none text-fg-muted">
      {children}
    </kbd>
  )
}

/**
 * 取得元の種別（GitHub / Docs）とソース名
 */
export function SourceMeta({ kind, name }: { kind: MockSourceKind, name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-fg-muted">
      <span
        className={`shrink-0 rounded border px-1.5 py-px text-[11px] font-medium ${
          kind === "github" ? "border-line-strong text-fg" : "border-amber/40 text-amber"
        }`}
      >
        {SOURCE_KIND_LABELS[kind]}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}

/**
 * 難易度。3 本のバーのうち難易度の数だけ灯す
 */
export function DifficultyMeter({ level, showLabel = true }: { level: MockDifficulty, showLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map(step => (
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

/**
 * 設問ごとの正誤を並べたマス。結果画面では順に灯す
 */
export function ScoreSquares({
  animate = false,
  results,
  size = "md",
}: {
  animate?: boolean
  results: (boolean | null)[]
  size?: "lg" | "md" | "sm"
}) {
  const sizeClass = size === "lg" ? "size-9 rounded-md" : size === "md" ? "size-3.5 rounded-[3px]" : "size-2.5 rounded-[2px]"
  return (
    <span className={`inline-flex ${size === "lg" ? "gap-2" : "gap-1"}`}>
      {results.map((result, index) => (
        <span
          aria-label={`Q${index + 1} ${result === null ? "未挑戦" : result ? "正解" : "不正解"}`}
          className={`${sizeClass} ${
            result === null ? "bg-heat-0" : result ? "bg-correct" : "border border-wrong/70 bg-wrong-wash"
          } ${animate ? "motion-safe:animate-lamp-on" : ""}`}
          key={index}
          role="img"
          style={animate ? { animationDelay: `${180 + index * 140}ms` } : undefined}
        />
      ))}
    </span>
  )
}
