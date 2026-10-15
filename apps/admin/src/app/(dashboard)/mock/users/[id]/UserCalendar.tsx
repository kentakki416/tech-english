const LEVEL_CLASSES = [
  "bg-gray-100 dark:bg-gray-800",
  "bg-brand-100 dark:bg-brand-500/25",
  "bg-brand-300 dark:bg-brand-500/50",
  "bg-brand-500",
  "bg-brand-700 dark:bg-brand-400",
]

const WEEKDAY_LABELS = ["", "月", "", "水", "", "金", ""]

/**
 * 学習カレンダーの草（直近 53 週、日曜始まり）。マイページと同じ並びを admin の色で出す
 */
export function UserCalendar({ days, studiedDayCount }: { days: { date: string, level: number }[], studiedDayCount: number }) {
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => days.slice(index * 7, index * 7 + 7))

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">学習カレンダー</h3>
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">直近 1 年で {studiedDayCount} 日</span>
      </div>
      <div className="custom-scrollbar mt-4 overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          <div className="mr-1 grid grid-rows-7 gap-[3px] text-[10px] leading-[11px] text-gray-400">
            {WEEKDAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
          </div>
          {weeks.map(week => (
            <div key={week[0].date} className="grid grid-rows-7 gap-[3px]">
              {week.map(day => (
                <span key={day.date} className={`size-[11px] rounded-[2px] ${LEVEL_CLASSES[day.level]}`} title={day.date} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-gray-400">
        少ない
        {LEVEL_CLASSES.map(levelClass => <span key={levelClass} className={`size-[11px] rounded-[2px] ${levelClass}`} />)}
        多い
      </div>
    </section>
  )
}
