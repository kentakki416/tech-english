import type { GetUserStatsResponse } from "@repo/api-schema"

/**
 * 連続学習日数のパネル。直近 14 日のマスは学習した日を琥珀にし、末尾（今日）は学習していれば光らせる
 */
export function StreakPanel({ isEmpty, streak }: { isEmpty: boolean, streak: GetUserStatsResponse["streak"] }) {
  const lastIndex = streak.recent_days.length - 1

  return (
    <section className="p-5">
      <h2 className="text-sm text-fg-muted">連続学習日数</h2>
      {isEmpty ? (
        <p className="mt-2 text-sm text-fg-faint">まだ記録がありません。</p>
      ) : (
        <>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold text-fg tabular-nums">{streak.current}</span>
            <span className="text-sm text-fg-muted">日</span>
            <span className="ml-auto text-xs text-fg-faint">最長 {streak.longest} 日</span>
          </p>
          <div aria-label="直近 14 日の学習" className="mt-3 flex gap-1" role="img">
            {streak.recent_days.map((day, index) => (
              <span
                key={day.date}
                className={`h-5 flex-1 rounded-[3px] ${day.has_studied ? "bg-amber" : "border border-line-strong"} ${
                  day.has_studied && index === lastIndex ? "shadow-[0_0_10px_rgb(243_178_76/0.6)]" : ""
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-faint">直近 14 日</p>
        </>
      )}
    </section>
  )
}
