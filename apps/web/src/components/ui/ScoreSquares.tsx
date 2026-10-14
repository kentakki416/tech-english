/**
 * 設問ごとの正誤を並べたマス。null は未挑戦。結果画面では animate で順に灯す
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
