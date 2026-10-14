import { Ionicons } from "@expo/vector-icons"
import { useEffect, useMemo, useRef, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import type { GetUserCalendarResponse, LearningRecordAttemptResponse } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { Segment } from "@/components/ui/Segment"
import { HEAT_COLORS, THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { formatDayLabel, formatSeconds, formatStudyMinutes } from "@/libs/format"

type CalendarDay = GetUserCalendarResponse["days"][number]

type CalendarView = "month" | "year"

/**
 * 月表示で取得した月の日（取得に失敗したら "error"）
 */
type FetchedMonth = CalendarDay[] | "error"

/**
 * 選んだ日の挑戦（取得に失敗したら attempts は null）
 */
type DayAttempts = { attempts: LearningRecordAttemptResponse[] | null, date: string }

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]

const VIEW_OPTIONS: { key: CalendarView, label: string }[] = [
  { key: "year", label: "1 年" },
  { key: "month", label: "今月" },
]

const LOAD_FAILED_MESSAGE = "読み込めませんでした。"

const CELL = 11
const GAP = 3

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

const getHeatColor = (level: number): string => HEAT_COLORS[level] ?? HEAT_COLORS[0]

/**
 * 学習カレンダー。年表示（草）と月表示を切り替え、日付を選ぶとその日の挑戦を出す（データの作り方は web と同じ）。
 * 年表示のデータは親（マイページ）が取得したものを受け取り、それより前の月と選んだ日の挑戦はここで取得する
 */
export function StudyCalendar({
  calendar,
  onPressAttempt,
}: {
  calendar: GetUserCalendarResponse
  onPressAttempt: (id: number) => void
}) {
  const { today } = calendar
  const currentMonth = today.slice(0, 7)
  const scrollRef = useRef<ScrollView>(null)
  const [view, setView] = useState<CalendarView>("year")
  const [month, setMonth] = useState(currentMonth)
  const [fetchedMonths, setFetchedMonths] = useState<Record<string, FetchedMonth>>({})
  const [selectedDate, setSelectedDate] = useState(today)
  const [dayAttempts, setDayAttempts] = useState<DayAttempts | null>(null)
  /**
   * 今選んでいる日付。取得が終わった時点で選択が変わっていたら（素早く切り替えた）結果を捨てるために使う
   */
  const selectedDateRef = useRef(today)
  const pendingMonthsRef = useRef(new Set<string>())
  /**
   * 前回の描画のときの今日。タブの画面はアンマウントされず state が最初のマウントの値のまま残るので、日付をまたいだかを比べるのに使う
   */
  const previousTodayRef = useRef(today)

  /**
   * 日付をまたいで取り直したとき（calendar.today が変わる）、前の今日を選んだままなら新しい今日を選び、
   * 前の今月を表示したままなら今月を表示する。ユーザーが選び直した日・移動した月はそのままにする
   */
  useEffect(() => {
    const previousToday = previousTodayRef.current
    if (previousToday === today) return
    previousTodayRef.current = today
    if (selectedDateRef.current === previousToday) {
      selectedDateRef.current = today
      setSelectedDate(today)
    }
    setMonth(current => current === previousToday.slice(0, 7) ? today.slice(0, 7) : current)
  }, [today])

  /**
   * from の曜日の数だけ空のマスで前を埋め、7 日ずつの列（月曜始まり）にする
   */
  const weeks = useMemo(() => {
    const cells: (CalendarDay | null)[] = [
      ...Array.from({ length: getMondayBasedWeekday(calendar.from) }, () => null),
      ...calendar.days,
    ]
    const result: (CalendarDay | null)[][] = []
    for (let index = 0; index < cells.length; index += 7) result.push(cells.slice(index, index + 7))
    return result
  }, [calendar])

  const dayByDate = useMemo(() => {
    const result = new Map<string, CalendarDay>()
    for (const days of Object.values(fetchedMonths)) {
      if (days !== "error") for (const day of days) result.set(day.date, day)
    }
    for (const day of calendar.days) result.set(day.date, day)
    return result
  }, [calendar, fetchedMonths])

  const isMonthInYearData = (target: string): boolean => `${target}-01` >= calendar.from
  const monthState: "error" | "loaded" | "loading" = isMonthInYearData(month)
    ? "loaded"
    : fetchedMonths[month] === undefined ? "loading" : fetchedMonths[month] === "error" ? "error" : "loaded"

  const loadMonth = async (target: string) => {
    if (pendingMonthsRef.current.has(target)) return
    pendingMonthsRef.current.add(target)
    try {
      const result = await learningRecordApi.getCalendar({ from: buildMonthDate(target, 1), to: buildMonthDate(target, countDaysInMonth(target)) })
      setFetchedMonths(current => ({ ...current, [target]: result.days }))
    } catch (error) {
      console.warn("Failed to fetch calendar month:", error)
      setFetchedMonths(current => ({ ...current, [target]: "error" }))
    } finally {
      pendingMonthsRef.current.delete(target)
    }
  }

  /**
   * 年表示のデータより前の月は、表示するときに 1 回だけ取得して月ごとに保持する（失敗した月は取り直す）
   */
  const showMonth = (target: string) => {
    setMonth(target)
    if (!isMonthInYearData(target) && (fetchedMonths[target] === undefined || fetchedMonths[target] === "error")) {
      void loadMonth(target)
    }
  }

  const changeView = (next: CalendarView) => {
    setView(next)
    if (next === "month") showMonth(currentMonth)
  }

  const selectDate = (date: string) => {
    selectedDateRef.current = date
    setSelectedDate(date)
  }

  const selectedDay = dayByDate.get(selectedDate)
  /**
   * カレンダーで学習していないと分かっている日は取得しない
   */
  const isKnownEmptyDay = selectedDay?.attempt_count === 0

  /**
   * 選んだ日の挑戦を取得する。マイページが取り直したとき（calendar が変わる）も取り直す（解いて戻ったときの今日の分）
   */
  useEffect(() => {
    if (isKnownEmptyDay) return
    const date = selectedDate
    const fetchDayAttempts = async () => {
      try {
        const page = await learningRecordApi.getAttempts({ date })
        if (selectedDateRef.current === date) setDayAttempts({ attempts: page.attempts, date })
      } catch (error) {
        console.warn("Failed to fetch attempts of the day:", error)
        if (selectedDateRef.current === date) setDayAttempts({ attempts: null, date })
      }
    }
    void fetchDayAttempts()
  }, [calendar, isKnownEmptyDay, selectedDate])

  const monthLeadingBlanks = getMondayBasedWeekday(buildMonthDate(month, 1))
  const monthLabel = month.slice(0, 4) === currentMonth.slice(0, 4)
    ? `${Number(month.slice(5, 7))}月`
    : `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`
  const isLatestMonth = month >= currentMonth
  const selectedAttempts = isKnownEmptyDay ? [] : dayAttempts?.date === selectedDate ? dayAttempts.attempts : undefined

  return (
    <View>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={appStyles.sectionTitle}>学習カレンダー</Text>
        <Segment options={VIEW_OPTIONS} value={view} onChange={changeView} />
      </View>

      {view === "year" ? (
        <View style={styles.yearRow}>
          {/**
            * 曜日の列は横スクロールの外に置いて動かさない
            */}
          <View style={styles.weekdayColumn}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text key={label} style={styles.weekdayLabel}>{index % 2 === 0 ? label : ""}</Text>
            ))}
          </View>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            <View style={styles.weeks}>
              {weeks.map((week, weekIndex) => (
                <View key={weekIndex} style={styles.week}>
                  {week.map((day, dayIndex) => day === null ? (
                    <View key={`blank-${dayIndex}`} style={styles.cell} />
                  ) : (
                    <Pressable
                      key={day.date}
                      accessibilityLabel={`${formatDayLabel(day.date)} ${day.attempt_count} 問 ${formatStudyMinutes(day.study_seconds)}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: day.date === selectedDate }}
                      hitSlop={2}
                      style={[
                        styles.cell,
                        { backgroundColor: getHeatColor(day.level) },
                        day.date === selectedDate && styles.cellSelected,
                        day.date === today && day.level > 0 && styles.cellToday,
                      ]}
                      onPress={() => selectDate(day.date)}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.month}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityLabel="前の月"
              accessibilityRole="button"
              hitSlop={8}
              style={styles.monthNav}
              onPress={() => showMonth(shiftMonth(month, -1))}
            >
              <Ionicons color={THEME_COLORS.fgMuted} name="chevron-back" size={18} />
            </Pressable>
            <Text accessibilityLiveRegion="polite" style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              accessibilityLabel="次の月"
              accessibilityRole="button"
              accessibilityState={{ disabled: isLatestMonth }}
              disabled={isLatestMonth}
              hitSlop={8}
              style={[styles.monthNav, isLatestMonth && styles.disabled]}
              onPress={() => showMonth(shiftMonth(month, 1))}
            >
              <Ionicons color={THEME_COLORS.fgMuted} name="chevron-forward" size={18} />
            </Pressable>
            {monthState === "loading" && <Text style={styles.monthStatus}>読み込み中…</Text>}
            {monthState === "error" && (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => showMonth(month)}>
                <Text style={[styles.monthStatus, styles.errorText]}>{LOAD_FAILED_MESSAGE}再読み込み</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.monthGrid}>
            {WEEKDAY_LABELS.map(label => <Text key={label} style={styles.monthWeekday}>{label}</Text>)}
            {Array.from({ length: monthLeadingBlanks }, (_, index) => <View key={`blank-${index}`} style={styles.monthCell} />)}
            {Array.from({ length: countDaysInMonth(month) }, (_, index) => {
              const date = buildMonthDate(month, index + 1)
              const day = dayByDate.get(date)
              const isFuture = date > today
              return (
                <Pressable
                  key={date}
                  accessibilityLabel={day ? `${formatDayLabel(date)} ${day.attempt_count} 問` : formatDayLabel(date)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isFuture, selected: date === selectedDate }}
                  disabled={isFuture}
                  style={[styles.monthCell, styles.monthCellBox, date === selectedDate && styles.monthCellSelected, isFuture && styles.disabled]}
                  onPress={() => selectDate(date)}
                >
                  <Text style={styles.monthDate}>{index + 1}</Text>
                  {day && !isFuture && <View style={[styles.monthLamp, { backgroundColor: getHeatColor(day.level) }]} />}
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      <View style={styles.legend}>
        <Text style={styles.legendText}>少</Text>
        {HEAT_COLORS.map(color => <View key={color} style={[styles.cell, { backgroundColor: color }]} />)}
        <Text style={styles.legendText}>多</Text>
        <Text style={[styles.legendText, styles.legendNote]}>色の濃さは学習時間</Text>
      </View>

      <View style={styles.dayDetail}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>{formatDayLabel(selectedDate)}</Text>
          {selectedDay !== undefined && selectedDay.attempt_count > 0 && (
            <Text style={appStyles.caption}>
              {selectedDay.attempt_count} 問、{formatStudyMinutes(selectedDay.study_seconds)}
            </Text>
          )}
        </View>
        {selectedAttempts === undefined ? (
          <Text style={styles.empty}>読み込み中…</Text>
        ) : selectedAttempts === null ? (
          <Text style={[styles.empty, styles.errorText]}>{LOAD_FAILED_MESSAGE}</Text>
        ) : selectedAttempts.length === 0 ? (
          <Text style={styles.empty}>この日の学習はありません。</Text>
        ) : (
          selectedAttempts.map(attempt => (
            <Pressable
              key={attempt.id}
              accessibilityRole="button"
              style={({ pressed }) => [styles.attemptRow, pressed && styles.attemptRowPressed]}
              onPress={() => onPressAttempt(attempt.id)}
            >
              <Text style={styles.attemptTime}>{attempt.submitted_time}</Text>
              <Text numberOfLines={1} style={styles.attemptTitle}>{attempt.title}</Text>
              <Text style={appStyles.caption}>{attempt.correct_count} / {attempt.question_count}</Text>
              <Text style={[appStyles.caption, styles.attemptElapsed]}>{formatSeconds(attempt.elapsed_seconds)}</Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  attemptElapsed: {
    textAlign: "right",
    width: 36,
  },
  attemptRow: {
    alignItems: "center",
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  attemptRowPressed: {
    opacity: 0.7,
  },
  attemptTime: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    width: 40,
  },
  attemptTitle: {
    color: THEME_COLORS.fg,
    flex: 1,
    fontFamily: THEME_FONTS.reading,
    fontSize: 15,
  },
  cell: {
    borderRadius: 2,
    height: CELL,
    width: CELL,
  },
  cellSelected: {
    borderColor: THEME_COLORS.fg,
    borderWidth: 1,
  },
  cellToday: {
    shadowColor: THEME_COLORS.amber,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  dayDetail: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingTop: 12,
  },
  dayHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  dayTitle: {
    color: THEME_COLORS.fg,
    fontSize: 14,
    fontWeight: "500",
  },
  disabled: {
    opacity: 0.35,
  },
  empty: {
    color: THEME_COLORS.fgFaint,
    fontSize: 13,
    paddingVertical: 6,
  },
  errorText: {
    color: THEME_COLORS.wrong,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legend: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 10,
  },
  legendNote: {
    marginLeft: 6,
  },
  legendText: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
  },
  month: {
    marginTop: 14,
  },
  monthCell: {
    width: "13.2%",
  },
  monthCellBox: {
    alignItems: "flex-start",
    aspectRatio: 1,
    borderColor: THEME_COLORS.line,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "space-between",
    padding: 5,
  },
  monthCellSelected: {
    borderColor: "rgba(221, 226, 234, 0.6)",
  },
  monthDate: {
    color: THEME_COLORS.fgMuted,
    fontSize: 11,
  },
  monthGrid: {
    columnGap: "1.2%",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    rowGap: 6,
  },
  monthHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  monthLabel: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    minWidth: 56,
    textAlign: "center",
  },
  monthLamp: {
    borderRadius: 2,
    height: 9,
    width: 9,
  },
  monthNav: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  monthStatus: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    marginLeft: 6,
  },
  monthWeekday: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
    textAlign: "center",
    width: "13.2%",
  },
  week: {
    gap: GAP,
  },
  weekdayColumn: {
    gap: GAP,
    marginRight: 6,
  },
  weekdayLabel: {
    color: THEME_COLORS.fgFaint,
    fontSize: 9,
    height: CELL,
    lineHeight: CELL,
  },
  weeks: {
    flexDirection: "row",
    gap: GAP,
  },
  yearRow: {
    flexDirection: "row",
    marginTop: 14,
  },
})
