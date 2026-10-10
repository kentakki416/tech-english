"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  formatSeconds,
  MOCK_ATTEMPT_HISTORY,
  MOCK_PASSAGE_LIST,
  MOCK_TODAY,
  type MockCalendarDay,
  type MockCalendarLevel,
} from "@/libs/mock-data"

const LEVEL_CLASS: Record<MockCalendarLevel, string> = {
  0: "bg-heat-0",
  1: "bg-heat-1",
  2: "bg-heat-2",
  3: "bg-heat-3",
  4: "bg-heat-4",
}

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]

const formatDayLabel = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[(value.getUTCDay() + 6) % 7]}）`
}

/**
 * 選んだ日の挑戦。モックでは履歴にある日はそれを、無い日は学習量に合わせて作る
 */
const listAttemptsOfDay = (day: MockCalendarDay) => {
  const recorded = MOCK_ATTEMPT_HISTORY.filter(attempt => attempt.date === day.date)
  if (recorded.length > 0 || day.attemptCount === 0) return recorded
  return Array.from({ length: day.attemptCount }, (_, index) => {
    const passage = MOCK_PASSAGE_LIST[(day.date.charCodeAt(9) + index) % MOCK_PASSAGE_LIST.length]
    return {
      id: index,
      assistUsed: index % 2 === 0,
      correctCount: Math.max(1, passage.questionCount - (index % 2)),
      date: day.date,
      elapsedSeconds: Math.round((day.studyMinutes * 60) / day.attemptCount),
      isOvertime: false,
      questionCount: passage.questionCount,
      submittedTime: index === 0 ? "08:10" : "21:40",
      title: passage.title,
    }
  })
}

/**
 * 学習カレンダー。年表示（草）と月表示を切り替え、日付を選ぶとその日の挑戦を出す
 */
export function StudyCalendar({ days, isEmpty = false }: { days: MockCalendarDay[], isEmpty?: boolean }) {
  const [view, setView] = useState<"month" | "year">("year")
  const [selectedDate, setSelectedDate] = useState<string>(MOCK_TODAY)
  const scrollRef = useRef<HTMLDivElement>(null)

  const calendarDays = useMemo(
    () => (isEmpty ? days.map((day): MockCalendarDay => ({ ...day, attemptCount: 0, level: 0, studyMinutes: 0 })) : days),
    [days, isEmpty],
  )

  const weeks = useMemo(() => {
    const result: MockCalendarDay[][] = []
    for (let index = 0; index < calendarDays.length; index += 7) result.push(calendarDays.slice(index, index + 7))
    return result
  }, [calendarDays])

  const monthLabels = weeks.map((week, index) => {
    const firstOfMonth = week.find(day => day.date.endsWith("-01"))
    if (index === 0 || firstOfMonth) {
      const date = new Date(`${(firstOfMonth ?? week[0]).date}T00:00:00Z`)
      return `${date.getUTCMonth() + 1}月`
    }
    return ""
  })

  const monthDays = calendarDays.filter(day => day.date.startsWith(MOCK_TODAY.slice(0, 7)))
  const monthLeadingBlanks = (new Date(`${MOCK_TODAY.slice(0, 7)}-01T00:00:00Z`).getUTCDay() + 6) % 7
  const monthTotalDays = 31

  const selectedDay = calendarDays.find(day => day.date === selectedDate) ?? calendarDays[calendarDays.length - 1]
  const selectedAttempts = listAttemptsOfDay(selectedDay)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [view])

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
              onClick={() => setView(option)}
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
                  {week.map(day => (
                    <button
                      key={day.date}
                      aria-label={`${formatDayLabel(day.date)} ${day.attemptCount} 問 ${day.studyMinutes} 分`}
                      aria-pressed={day.date === selectedDate}
                      className={`size-[11px] rounded-[2px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-amber/60 ${LEVEL_CLASS[day.level]} ${
                        day.date === selectedDate ? "ring-1 ring-fg ring-offset-1 ring-offset-canvas" : ""
                      } ${day.date === MOCK_TODAY && day.level > 0 ? "shadow-[0_0_10px_rgb(243_178_76/0.7)] motion-safe:animate-lamp-on [animation-delay:400ms]" : ""}`}
                      onClick={() => setSelectedDate(day.date)}
                      title={`${formatDayLabel(day.date)}：${day.attemptCount} 問、${day.studyMinutes} 分`}
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
          <p className="text-sm text-fg-muted">{Number(MOCK_TODAY.slice(5, 7))}月</p>
          <div className="mt-2 grid grid-cols-7 gap-1.5 text-center text-[11px] text-fg-faint">
            {WEEKDAY_LABELS.map(label => <span key={label}>{label}</span>)}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1.5">
            {Array.from({ length: monthLeadingBlanks }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: monthTotalDays }, (_, index) => {
              const day = monthDays[index]
              const isFuture = !day
              return (
                <button
                  key={index}
                  disabled={isFuture}
                  aria-pressed={day?.date === selectedDate}
                  className={`flex aspect-square flex-col items-start justify-between rounded-md border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber/60 sm:aspect-[4/3] ${
                    day?.date === selectedDate ? "border-fg/60" : "border-line"
                  } ${isFuture ? "opacity-35" : "hover:border-line-strong"}`}
                  onClick={() => day && setSelectedDate(day.date)}
                  type="button"
                >
                  <span className="text-xs text-fg-muted tabular-nums">{index + 1}</span>
                  {day && (
                    <span className="flex items-center gap-1">
                      <span className={`size-2.5 rounded-[2px] ${LEVEL_CLASS[day.level]}`} />
                      {day.attemptCount > 0 && <span className="hidden text-[11px] text-fg-muted sm:inline">{day.attemptCount} 問</span>}
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
          {([0, 1, 2, 3, 4] as const).map(level => <span key={level} className={`size-[11px] rounded-[2px] ${LEVEL_CLASS[level]}`} />)}
          多
        </span>
        <span>色の濃さは学習時間（5 分 / 15 分 / 30 分で段階が変わります）</span>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-fg">{formatDayLabel(selectedDay.date)}</h3>
          {selectedDay.attemptCount > 0 && (
            <p className="text-xs text-fg-muted tabular-nums">{selectedDay.attemptCount} 問、{selectedDay.studyMinutes} 分</p>
          )}
        </div>
        {selectedAttempts.length === 0 ? (
          <p className="mt-2 text-sm text-fg-faint">この日の学習はありません。</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {selectedAttempts.map(attempt => (
              <li key={`${attempt.id}-${attempt.submittedTime}`}>
                <Link className="flex items-center gap-3 py-2 text-sm hover:text-amber-bright" href="/mock/attempts/42/result">
                  <span className="w-11 shrink-0 text-xs text-fg-faint tabular-nums">{attempt.submittedTime}</span>
                  <span className="min-w-0 flex-1 truncate font-reading text-[15px] text-fg">{attempt.title}</span>
                  <span className="shrink-0 text-xs text-fg-muted tabular-nums">{attempt.correctCount} / {attempt.questionCount}</span>
                  <span className="w-10 shrink-0 text-right text-xs text-fg-faint tabular-nums">{formatSeconds(attempt.elapsedSeconds)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
