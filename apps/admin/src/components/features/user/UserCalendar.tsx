import type { GetAdminUserCalendarResponse } from "@repo/api-schema"

const LEVEL_CLASSES = [
  "bg-gray-100 dark:bg-gray-800",
  "bg-brand-100 dark:bg-brand-500/25",
  "bg-brand-300 dark:bg-brand-500/50",
  "bg-brand-500",
  "bg-brand-700 dark:bg-brand-400",
]

const WEEKDAY_LABELS = ["", "月", "", "水", "", "金", ""]

/**
 * 日曜始まりの週に並べる。始まりの日の前は空のマス（null）で埋める
 */
const groupDaysIntoWeeks = (days: GetAdminUserCalendarResponse["days"]): (GetAdminUserCalendarResponse["days"][number] | null)[][] => {
  if (days.length === 0) return []
  const leadingBlanks = new Date(`${days[0].date}T00:00:00Z`).getUTCDay()
  const cells = [...Array.from({ length: leadingBlanks }, () => null), ...days]
  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7))
}

/**
 * 学習カレンダーの草（マイページと同じ範囲・段階。日曜始まり）を admin の色で出す。
 * 幅が足りないときに直近の週が見えるよう、横スクロールの始まりを右端にする（dir="rtl"。中の並びは左から右のまま）
 */
export function UserCalendar({ calendar }: { calendar: GetAdminUserCalendarResponse }) {
  const weeks = groupDaysIntoWeeks(calendar.days)
  const studiedDayCount = calendar.days.filter(day => day.level > 0).length

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-gray-800 dark:bg-white/3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="shrink-0 text-lg font-semibold text-gray-800 dark:text-white/90">学習カレンダー</h3>
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">
          {calendar.from} 〜 {calendar.to} で {studiedDayCount} 日
        </span>
      </div>
      <div className="custom-scrollbar mt-4 overflow-x-auto pb-1" dir="rtl">
        <div className="mr-auto flex w-max gap-[3px]" dir="ltr">
          <div className="mr-1 grid grid-rows-7 gap-[3px] text-[10px] leading-[11px] text-gray-400">
            {WEEKDAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-[3px]">
              {week.map((day, dayIndex) =>
                day === null
                  ? <span key={`blank-${dayIndex}`} className="size-[11px]" />
                  : <span key={day.date} className={`size-[11px] rounded-[2px] ${LEVEL_CLASSES[day.level] ?? LEVEL_CLASSES[0]}`} title={`${day.date}・${day.attempt_count} 問・${day.card_count} 枚`} />,
              )}
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
