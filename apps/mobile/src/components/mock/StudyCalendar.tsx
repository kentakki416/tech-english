import { useRouter } from "expo-router"
import { useMemo, useRef, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

import { MOCK_COLORS, MOCK_FONTS, MOCK_HEAT_COLORS } from "@/const/mock-theme"
import {
  formatSeconds,
  MOCK_ATTEMPT_HISTORY,
  MOCK_TODAY,
  type MockCalendarDay,
} from "@/libs/mock-data"

import { mockStyles, Segment } from "./parts"

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"]

const CELL = 11
const GAP = 3

const formatDayLabel = (date: string): string => {
  const value = new Date(`${date}T00:00:00Z`)
  return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日（${WEEKDAY_LABELS[(value.getUTCDay() + 6) % 7]}）`
}

/**
 * 1 日の要約（「1 問、単語 12 枚、7 分」）。0 の項目は出さず、学習していない日は空文字（web のモックと同じ）
 */
const formatDaySummary = (day: MockCalendarDay): string => {
  const items = [
    day.attemptCount > 0 ? `${day.attemptCount} 問` : null,
    day.cardCount > 0 ? `単語 ${day.cardCount} 枚` : null,
  ].filter((item): item is string => item !== null)
  return items.length === 0 ? "" : [...items, `${day.studyMinutes} 分`].join("、")
}

/**
 * 学習カレンダー。年表示（草）と今月の表示を切り替え、日付を選ぶとその日の挑戦を出す
 */
export function StudyCalendar({ days, isEmpty = false }: { days: MockCalendarDay[], isEmpty?: boolean }) {
  const router = useRouter()
  const scrollRef = useRef<ScrollView>(null)
  const [view, setView] = useState<"month" | "year">("year")
  const [selectedDate, setSelectedDate] = useState(MOCK_TODAY)

  const calendarDays = useMemo(
    () => (isEmpty ? days.map((day): MockCalendarDay => ({ ...day, attemptCount: 0, cardCount: 0, level: 0, rememberedCount: 0, studyMinutes: 0 })) : days),
    [days, isEmpty],
  )
  const weeks = useMemo(() => {
    const result: MockCalendarDay[][] = []
    for (let index = 0; index < calendarDays.length; index += 7) result.push(calendarDays.slice(index, index + 7))
    return result
  }, [calendarDays])

  const monthDays = calendarDays.filter(day => day.date.startsWith(MOCK_TODAY.slice(0, 7)))
  const leadingBlanks = (new Date(`${MOCK_TODAY.slice(0, 7)}-01T00:00:00Z`).getUTCDay() + 6) % 7
  const selectedDay = calendarDays.find(day => day.date === selectedDate) ?? calendarDays[calendarDays.length - 1]
  const selectedAttempts = isEmpty ? [] : MOCK_ATTEMPT_HISTORY.filter(attempt => attempt.date === selectedDay.date)

  return (
    <View>
      <View style={styles.header}>
        <Text style={mockStyles.sectionTitle}>学習カレンダー</Text>
        <Segment
          onChange={setView}
          options={[{ key: "year", label: "1 年" }, { key: "month", label: "今月" }]}
          value={view}
        />
      </View>

      {view === "year" ? (
        <View style={styles.yearRow}>
          <View style={styles.weekdayColumn}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text key={label} style={styles.weekdayLabel}>{index % 2 === 0 ? label : ""}</Text>
            ))}
          </View>
          <ScrollView
            horizontal
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            ref={scrollRef}
            showsHorizontalScrollIndicator={false}
          >
            <View style={{ flexDirection: "row", gap: GAP }}>
              {weeks.map((week, weekIndex) => (
                <View key={weekIndex} style={{ gap: GAP }}>
                  {week.map(day => (
                    <Pressable
                      key={day.date}
                      accessibilityLabel={`${formatDayLabel(day.date)} ${formatDaySummary(day)}`.trim()}
                      hitSlop={2}
                      onPress={() => setSelectedDate(day.date)}
                      style={[
                        styles.cell,
                        { backgroundColor: MOCK_HEAT_COLORS[day.level] },
                        day.date === selectedDate && styles.cellSelected,
                        day.date === MOCK_TODAY && day.level > 0 && styles.cellToday,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={styles.month}>
          <Text style={mockStyles.caption}>{Number(MOCK_TODAY.slice(5, 7))}月</Text>
          <View style={styles.monthGrid}>
            {WEEKDAY_LABELS.map(label => <Text key={label} style={styles.monthWeekday}>{label}</Text>)}
            {Array.from({ length: leadingBlanks }, (_, index) => <View key={`blank-${index}`} style={styles.monthCell} />)}
            {Array.from({ length: 31 }, (_, index) => {
              const day = monthDays[index]
              return (
                <Pressable
                  key={index}
                  accessibilityLabel={day ? `${formatDayLabel(day.date)} ${formatDaySummary(day)}`.trim() : undefined}
                  disabled={!day}
                  onPress={() => day && setSelectedDate(day.date)}
                  style={[styles.monthCell, styles.monthCellBox, day?.date === selectedDate && styles.monthCellSelected, !day && { opacity: 0.35 }]}
                >
                  <Text style={styles.monthDate}>{index + 1}</Text>
                  {day && <View style={[styles.monthLamp, { backgroundColor: MOCK_HEAT_COLORS[day.level] }]} />}
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      <View style={styles.legend}>
        <Text style={styles.legendText}>少</Text>
        {MOCK_HEAT_COLORS.map(color => <View key={color} style={[styles.cell, { backgroundColor: color }]} />)}
        <Text style={styles.legendText}>多</Text>
        <Text style={[styles.legendText, { marginLeft: 6 }]}>色の濃さは学習時間</Text>
      </View>

      <View style={styles.dayDetail}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>{formatDayLabel(selectedDay.date)}</Text>
          {formatDaySummary(selectedDay) !== "" && <Text style={mockStyles.caption}>{formatDaySummary(selectedDay)}</Text>}
        </View>
        {selectedAttempts.length === 0 && selectedDay.cardCount === 0 ? (
          <Text style={styles.empty}>{selectedDay.attemptCount > 0 ? "（モックではこの日の内訳を省略）" : "この日の学習はありません。"}</Text>
        ) : (
          selectedAttempts.map(attempt => (
            <Pressable key={attempt.id} onPress={() => router.push("/mock/attempts/42/result")} style={styles.attemptRow}>
              <Text style={styles.attemptTime}>{attempt.submittedTime}</Text>
              <Text numberOfLines={1} style={styles.attemptTitle}>{attempt.title}</Text>
              <Text style={mockStyles.caption}>{attempt.correctCount} / {attempt.questionCount}</Text>
              <Text style={[mockStyles.caption, { width: 36, textAlign: "right" }]}>{formatSeconds(attempt.elapsedSeconds)}</Text>
            </Pressable>
          ))
        )}
        {selectedDay.cardCount > 0 && (
          <Pressable accessibilityRole="button" onPress={() => router.navigate("/mock/vocabulary")} style={styles.attemptRow}>
            <View style={styles.vocabularyIcon} />
            <Text numberOfLines={1} style={styles.vocabularyTitle}>単語帳</Text>
            <Text style={mockStyles.caption}>{selectedDay.cardCount} 枚（覚えた {selectedDay.rememberedCount}）</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  attemptRow: {
    alignItems: "center",
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  attemptTime: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
    width: 40,
  },
  attemptTitle: {
    color: MOCK_COLORS.fg,
    flex: 1,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 15,
  },
  cell: {
    borderRadius: 2,
    height: CELL,
    width: CELL,
  },
  cellSelected: {
    borderColor: MOCK_COLORS.fg,
    borderWidth: 1,
  },
  cellToday: {
    shadowColor: MOCK_COLORS.amber,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  dayDetail: {
    borderColor: MOCK_COLORS.line,
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
    color: MOCK_COLORS.fg,
    fontSize: 14,
    fontWeight: "500",
  },
  empty: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 13,
    paddingVertical: 6,
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
  legendText: {
    color: MOCK_COLORS.fgFaint,
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
    borderColor: MOCK_COLORS.line,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: "space-between",
    padding: 5,
  },
  monthCellSelected: {
    borderColor: "rgba(221, 226, 234, 0.6)",
  },
  monthDate: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 11,
  },
  monthGrid: {
    columnGap: "1.2%",
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    rowGap: 6,
  },
  monthLamp: {
    borderRadius: 2,
    height: 9,
    width: 9,
  },
  monthWeekday: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 11,
    textAlign: "center",
    width: "13.2%",
  },
  weekdayColumn: {
    gap: GAP,
    marginRight: 6,
  },
  weekdayLabel: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 9,
    height: CELL,
    lineHeight: CELL,
  },
  yearRow: {
    flexDirection: "row",
    marginTop: 14,
  },
  vocabularyIcon: {
    backgroundColor: "#efe4cf",
    borderRadius: 2,
    height: 12,
    width: 16,
  },
  vocabularyTitle: {
    color: MOCK_COLORS.fg,
    flex: 1,
    fontSize: 14,
  },
})
