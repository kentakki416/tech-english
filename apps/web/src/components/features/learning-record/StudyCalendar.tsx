"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import type { GetUserAttemptsResponse, GetUserCalendarResponse, LearningRecordAttemptResponse } from "@repo/api-schema"

import { formatDayLabel, formatSeconds, formatStudyDaySummary } from "@/libs/format"

type CalendarDay = GetUserCalendarResponse["days"][number]

/**
 * 月表示で取得した月の日（取得に失敗したら "error"）
 */
type FetchedMonth = CalendarDay[] | "error"

/**
 * 選んだ日の挑戦（取得に失敗したら attempts は null）
 */
type DayAttempts = { attempts: LearningRecordAttemptResponse[] | null, date: string }

/**
 * 色の段階（0〜4。api が学習秒数から決める）の class
 */
const LEVEL_CLASSES = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"]

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]

const LOAD_FAILED_MESSAGE = "読み込めませんでした。時間をおいて再度お試しください。"

/**
 * 月曜を 0 とした曜日
 */
const getMondayBasedWeekday = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

/**
 * `YYYY-MM` の日数
 */
const countDaysInMonth = (month: string): number => {
  const [year, monthNumber] = month.split("-").map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

/**
 * `YYYY-MM` を offset か月ずらす
 */
const shiftMonth = (month: string, offset: number): string => {
  const [year, monthNumber] = month.split("-").map(Number)
  const value = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`
}

const buildMonthDate = (month: string, day: number): string => `${month}-${String(day).padStart(2, "0")}`

const getLevelClass = (level: number): string => LEVEL_CLASSES[level] ?? LEVEL_CLASSES[0]

const hasFirstOfMonth = (week: (CalendarDay | null)[]): boolean => week.some(day => day?.date.endsWith("-01"))

/**
 * マスのツールチップ・読み上げのラベル（`10月10日（土）：1 問、単語 12 枚、7 分`）。学習していない日は日付だけ
 */
const buildDayCellLabel = (date: string, day: CalendarDay | undefined, separator: string): string => {
  const summary = day ? formatStudyDaySummary(day) : ""
  return summary === "" ? formatDayLabel(date) : `${formatDayLabel(date)}${separator}${summary}`
}

/**
 * 学習カレンダー。年表示（草）と月表示を切り替え、日付を選ぶとその日の挑戦を出す。
 * 年表示のデータは Server Component から受け取り、それより前の月と選んだ日の挑戦は Route Handler から取得する
 */
export function StudyCalendar({ initialCalendar }: { initialCalendar: GetUserCalendarResponse }) {
  const { today } = initialCalendar
  const currentMonth = today.slice(0, 7)
  const [view, setView] = useState<"month" | "year">("year")
  const [month, setMonth] = useState(currentMonth)
  const [fetchedMonths, setFetchedMonths] = useState<Record<string, FetchedMonth>>({})
  const [selectedDate, setSelectedDate] = useState(today)
  const [dayAttempts, setDayAttempts] = useState<DayAttempts | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingMonthsRef = useRef(new Set<string>())

  /**
   * from の曜日の数だけ空のマスで前を埋め、7 日ずつの列（月曜始まり）にする
   */
  const weeks = useMemo(() => {
    const cells: (CalendarDay | null)[] = [
      ...Array.from({ length: getMondayBasedWeekday(initialCalendar.from) }, () => null),
      ...initialCalendar.days,
    ]
    const result: (CalendarDay | null)[][] = []
    for (let index = 0; index < cells.length; index += 7) result.push(cells.slice(index, index + 7))
    return result
  }, [initialCalendar])

  /**
   * 月のラベルは 1 日を含む列に付ける。先頭の列は、すぐ後に 1 日の列が無いときだけ付ける（ラベルの重なりを防ぐ）
   */
  const monthLabels = weeks.map((week, index) => {
    const firstOfMonth = week.find(day => day?.date.endsWith("-01"))
    const labelDay = firstOfMonth ?? (index === 0 && !weeks.slice(1, 3).some(hasFirstOfMonth) ? week.find(day => day !== null) : undefined)
    return labelDay ? `${Number(labelDay.date.slice(5, 7))}月` : ""
  })

  const dayByDate = useMemo(() => {
    const result = new Map<string, CalendarDay>()
    for (const days of Object.values(fetchedMonths)) {
      if (days !== "error") for (const day of days) result.set(day.date, day)
    }
    for (const day of initialCalendar.days) result.set(day.date, day)
    return result
  }, [fetchedMonths, initialCalendar])

  const isMonthInYearData = (target: string): boolean => `${target}-01` >= initialCalendar.from
  const monthState: "error" | "loaded" | "loading" = isMonthInYearData(month)
    ? "loaded"
    : fetchedMonths[month] === undefined ? "loading" : fetchedMonths[month] === "error" ? "error" : "loaded"

  const loadMonth = async (target: string) => {
    if (pendingMonthsRef.current.has(target)) return
    pendingMonthsRef.current.add(target)
    try {
      const params = new URLSearchParams({ from: buildMonthDate(target, 1), to: buildMonthDate(target, countDaysInMonth(target)) })
      const res = await fetch(`/api/user/calendar?${params}`)
      if (!res.ok) throw new Error(`status ${res.status}`)
      const calendar = await res.json() as GetUserCalendarResponse
      setFetchedMonths(current => ({ ...current, [target]: calendar.days }))
    } catch {
      setFetchedMonths(current => ({ ...current, [target]: "error" }))
    } finally {
      pendingMonthsRef.current.delete(target)
    }
  }

  /**
   * 年表示のデータより前の月は、表示するときに 1 回だけ取得して月ごとに保持する
   */
  const showMonth = (target: string) => {
    setMonth(target)
    if (!isMonthInYearData(target) && (fetchedMonths[target] === undefined || fetchedMonths[target] === "error")) {
      void loadMonth(target)
    }
  }

  const selectedDay = dayByDate.get(selectedDate)
  /**
   * カレンダーで挑戦が無いと分かっている日（学習していない日・単語帳だけの日）は取得しない
   */
  const isKnownNoAttemptDay = selectedDay?.attempt_count === 0

  useEffect(() => {
    if (isKnownNoAttemptDay) return
    const controller = new AbortController()
    fetch(`/api/user/attempts?${new URLSearchParams({ date: selectedDate })}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return await res.json() as GetUserAttemptsResponse
      })
      .then(page => setDayAttempts({ attempts: page.attempts, date: selectedDate }))
      .catch(() => {
        if (!controller.signal.aborted) setDayAttempts({ attempts: null, date: selectedDate })
      })
    return () => controller.abort()
  }, [isKnownNoAttemptDay, selectedDate])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [view])

  const monthLeadingBlanks = getMondayBasedWeekday(buildMonthDate(month, 1))
  const monthLabel = month.slice(0, 4) === currentMonth.slice(0, 4)
    ? `${Number(month.slice(5, 7))}月`
    : `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`
  const selectedAttempts = isKnownNoAttemptDay ? [] : dayAttempts?.date === selectedDate ? dayAttempts.attempts : undefined
  const selectedSummary = selectedDay ? formatStudyDaySummary(selectedDay) : ""
  const selectedCardCount = selectedDay?.card_count ?? 0

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-fg">学習カレンダー</h2>
        <div aria-label="表示の切り替え" className="flex rounded-md border border-line p-0.5 text-xs" role="group">
          {(["year", "month"] as const).map(option => (
            <button
              key={option}
              aria-pressed={view === option}
              className={`rounded px-2.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${
                view === option ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
              }`}
              onClick={() => {
                setView(option)
                if (option === "month") showMonth(currentMonth)
              }}
              type="button"
            >
              {option === "year" ? "1 年" : "今月"}
            </button>
          ))}
        </div>
      </div>

      {view === "year" ? (
        <div className="mt-4 overflow-x-auto pb-2" ref={scrollRef}>
          <div className="inline-grid grid-cols-[1.5rem_auto] gap-x-2">
            <span />
            <div className="flex gap-[3px] text-[10px] text-fg-faint">
              {monthLabels.map((label, index) => (
                <span key={index} className="w-[11px] overflow-visible whitespace-nowrap">{label}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-rows-7 gap-[3px] text-[10px] leading-[11px] text-fg-faint">
              {WEEKDAY_LABELS.map((label, index) => <span key={label}>{index % 2 === 0 ? label : ""}</span>)}
            </div>
            <div className="mt-1 flex gap-[3px]">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-rows-7 gap-[3px]">
                  {week.map((day, dayIndex) => day === null ? (
                    <span key={`blank-${dayIndex}`} className="size-[11px]" />
                  ) : (
                    <button
                      key={day.date}
                      aria-label={buildDayCellLabel(day.date, day, " ")}
                      aria-pressed={day.date === selectedDate}
                      className={`size-[11px] rounded-[2px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-amber/60 ${getLevelClass(day.level)} ${
                        day.date === selectedDate ? "ring-1 ring-fg ring-offset-1 ring-offset-canvas" : ""
                      } ${day.date === today && day.level > 0 ? "shadow-[0_0_10px_rgb(243_178_76/0.7)] motion-safe:animate-lamp-on [animation-delay:400ms]" : ""}`}
                      onClick={() => setSelectedDate(day.date)}
                      title={buildDayCellLabel(day.date, day, "：")}
                      type="button"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-1">
            <button
              aria-label="前の月"
              className="grid size-7 place-items-center rounded-md text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
              onClick={() => showMonth(shiftMonth(month, -1))}
              type="button"
            >
              ‹
            </button>
            <p aria-live="polite" className="min-w-14 text-center text-sm text-fg-muted">{monthLabel}</p>
            <button
              aria-label="次の月"
              className="grid size-7 place-items-center rounded-md text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
              disabled={month >= currentMonth}
              onClick={() => showMonth(shiftMonth(month, 1))}
              type="button"
            >
              ›
            </button>
            {monthState === "loading" && <span className="ml-2 text-xs text-fg-faint">読み込み中…</span>}
            {monthState === "error" && (
              <span className="ml-2 flex items-center gap-2 text-xs text-wrong" role="alert">
                {LOAD_FAILED_MESSAGE}
                <button className="text-fg-muted underline hover:text-fg" onClick={() => showMonth(month)} type="button">再読み込み</button>
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5 text-center text-[11px] text-fg-faint">
            {WEEKDAY_LABELS.map(label => <span key={label}>{label}</span>)}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {Array.from({ length: monthLeadingBlanks }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: countDaysInMonth(month) }, (_, index) => {
              const date = buildMonthDate(month, index + 1)
              const day = dayByDate.get(date)
              const isFuture = date > today
              return (
                <button
                  key={date}
                  aria-label={buildDayCellLabel(date, day, " ")}
                  aria-pressed={date === selectedDate}
                  className={`flex aspect-square flex-col items-start justify-between rounded-md border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber/60 sm:aspect-[4/3] ${
                    date === selectedDate ? "border-fg/60" : "border-line"
                  } ${isFuture ? "opacity-35" : "hover:border-line-strong"}`}
                  disabled={isFuture}
                  onClick={() => setSelectedDate(date)}
                  type="button"
                >
                  <span className="text-xs text-fg-muted tabular-nums">{index + 1}</span>
                  {day && !isFuture && (
                    <span className="flex items-center gap-1">
                      <span className={`size-2.5 rounded-[2px] ${getLevelClass(day.level)}`} />
                      {day.attempt_count > 0 && <span className="hidden text-[11px] text-fg-muted sm:inline">{day.attempt_count} 問</span>}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-faint">
        <span className="flex items-center gap-1.5">
          少
          {LEVEL_CLASSES.map(levelClass => <span key={levelClass} className={`size-[11px] rounded-[2px] ${levelClass}`} />)}
          多
        </span>
        <span>色の濃さは学習時間（5 分 / 15 分 / 30 分で段階が変わります）</span>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-fg">{formatDayLabel(selectedDate)}</h3>
          {selectedSummary !== "" && <p className="text-xs text-fg-muted tabular-nums">{selectedSummary}</p>}
        </div>
        {selectedAttempts === undefined ? (
          <p className="mt-2 text-sm text-fg-faint">読み込み中…</p>
        ) : selectedAttempts === null ? (
          <p className="mt-2 text-sm text-wrong" role="alert">{LOAD_FAILED_MESSAGE}</p>
        ) : selectedAttempts.length === 0 && selectedCardCount === 0 ? (
          <p className="mt-2 text-sm text-fg-faint">この日の学習はありません。</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {selectedAttempts.map(attempt => (
              <li key={attempt.id}>
                <Link className="flex items-center gap-3 py-2 text-sm hover:text-amber-bright" href={`/attempts/${attempt.id}/result`}>
                  <span className="w-11 shrink-0 text-xs text-fg-faint tabular-nums">{attempt.submitted_time}</span>
                  <span className="min-w-0 flex-1 truncate font-reading text-[15px] text-fg">{attempt.title}</span>
                  <span className="shrink-0 text-xs text-fg-muted tabular-nums">{attempt.correct_count} / {attempt.question_count}</span>
                  <span className="w-10 shrink-0 text-right text-xs text-fg-faint tabular-nums">{formatSeconds(attempt.elapsed_seconds)}</span>
                </Link>
              </li>
            ))}
            {selectedDay !== undefined && selectedCardCount > 0 && (
              <li>
                <Link className="group flex items-center gap-3 py-2 text-sm" href="/vocabulary">
                  <span aria-hidden className="grid w-11 shrink-0 place-items-start">
                    <span className="block h-3 w-4 rounded-[2px] bg-paper shadow-[2px_2px_0_rgb(242_232_213/0.35)]" />
                  </span>
                  <span className="min-w-0 flex-1 text-fg group-hover:text-amber-bright">単語帳</span>
                  <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                    {selectedCardCount} 枚（覚えた {selectedDay.remembered_count}）
                  </span>
                  <span className="w-10 shrink-0" />
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
