import { useLocalSearchParams, useRouter } from "expo-router"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { mockStyles, PrimaryButton, ScoreSquares, SecondaryButton, Wordmark } from "@/components/mock/parts"
import { StudyCalendar } from "@/components/mock/StudyCalendar"
import { MOCK_COLORS, MOCK_FONTS } from "@/const/mock-theme"
import {
  createMockCalendar,
  formatSeconds,
  MOCK_ATTEMPT_HISTORY,
  MOCK_STATS,
  MOCK_USER,
  QUESTION_TYPE_LABELS,
} from "@/libs/mock-data"

const CALENDAR = createMockCalendar()
const RECENT_DAYS = CALENDAR.slice(-14)

const formatStudyTime = (minutes: number): string => `${Math.floor(minutes / 60)}時間${minutes % 60}分`

/**
 * マイページ（モック）。続ける動機になる連続日数と目標を先に、次にカレンダーと統計を並べる
 */
export default function MockHomeScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const isEmpty = params.state === "empty"
  const { goal, streak, totals, typeAccuracy } = MOCK_STATS

  return (
    <SafeAreaView edges={["top"]} style={mockStyles.screen}>
      <View style={styles.header}>
        <Wordmark />
        <View style={styles.avatar}><Text style={styles.avatarText}>{MOCK_USER.avatarInitial}</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.name}>{MOCK_USER.name}</Text>

        {isEmpty ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>最初の 1 問を解いてみましょう</Text>
            <Text style={styles.emptyText}>公式ドキュメントや GitHub の英文を読んで、4 択の設問に答えます。1 問 5〜10 分ほどです。解くと、今日のマスに色が付きます。</Text>
            <View style={{ marginTop: 16 }}><PrimaryButton label="ランダムに 1 問解く" onPress={() => router.push("/mock/passages/57")} /></View>
          </View>
        ) : (
          <View style={styles.actions}>
            <View style={{ flex: 1 }}><SecondaryButton label="問題一覧" onPress={() => router.navigate("/mock/passages")} /></View>
            <View style={{ flex: 1.4 }}><PrimaryButton label="ランダムに 1 問解く" onPress={() => router.push("/mock/passages/57")} /></View>
          </View>
        )}

        <View style={[mockStyles.card, { marginTop: 20 }]}>
          <View style={styles.panelSection}>
            <Text style={mockStyles.caption}>連続学習日数</Text>
            {isEmpty ? (
              <Text style={styles.faintText}>まだ記録がありません。</Text>
            ) : (
              <>
                <View style={styles.streakRow}>
                  <Text style={styles.streakNumber}>{streak.current}</Text>
                  <Text style={mockStyles.caption}>日</Text>
                  <Text style={[styles.faintText, { marginLeft: "auto", marginTop: 0 }]}>最長 {streak.longest} 日</Text>
                </View>
                <View style={styles.lamps}>
                  {RECENT_DAYS.map((day, index) => (
                    <View
                      key={day.date}
                      style={[styles.lamp, day.level > 0 ? styles.lampOn : styles.lampOff, index === RECENT_DAYS.length - 1 && day.level > 0 && styles.lampToday]}
                    />
                  ))}
                </View>
                <Text style={styles.faintText}>直近 14 日</Text>
              </>
            )}
          </View>
          <View style={mockStyles.divider} />
          <View style={styles.panelSection}>
            <View style={styles.rowBetween}>
              <Text style={mockStyles.caption}>目標</Text>
              <Pressable onPress={() => router.navigate("/mock/settings")}><Text style={mockStyles.caption}>編集</Text></Pressable>
            </View>
            {isEmpty ? (
              <>
                <Text style={styles.faintText}>目標はまだありません。</Text>
                <Pressable onPress={() => router.navigate("/mock/settings")}><Text style={styles.link}>目標を設定する</Text></Pressable>
              </>
            ) : (
              <>
                <Text style={styles.goalText}>{goal.goalText}</Text>
                <Text style={[mockStyles.caption, { marginTop: 4 }]}>{goal.targetDate.replaceAll("-", "/")} まで あと {goal.daysLeft} 日</Text>
                <View style={[styles.rowBetween, { marginTop: 16 }]}>
                  <Text style={mockStyles.caption}>今週</Text>
                  <Text style={styles.weekValue}>{goal.weeklyValue} / {goal.weeklyTarget} 問</Text>
                </View>
                <View style={styles.weekBars}>
                  {Array.from({ length: goal.weeklyTarget }, (_, index) => (
                    <View key={index} style={[styles.weekBar, { backgroundColor: index < goal.weeklyValue ? MOCK_COLORS.amber : MOCK_COLORS.heat0 }]} />
                  ))}
                </View>
                <Text style={styles.faintText}>あと {goal.weeklyTarget - goal.weeklyValue} 問で今週の目標を達成します。</Text>
              </>
            )}
          </View>
          {!isEmpty && (
            <>
              <View style={mockStyles.divider} />
              <View style={styles.panelSection}>
                <View style={styles.rowBetween}>
                  <Text style={mockStyles.caption}>最近の挑戦</Text>
                  <Pressable onPress={() => router.push("/mock/history")}><Text style={mockStyles.caption}>すべて見る</Text></Pressable>
                </View>
                {MOCK_ATTEMPT_HISTORY.slice(0, 3).map(attempt => (
                  <Pressable key={attempt.id} onPress={() => router.push("/mock/attempts/42/result")} style={styles.recentRow}>
                    <Text numberOfLines={1} style={styles.recentTitle}>{attempt.title}</Text>
                    <View style={styles.recentMeta}>
                      <ScoreSquares results={Array.from({ length: attempt.questionCount }, (_, index) => index < attempt.correctCount)} />
                      <Text style={mockStyles.caption}>{attempt.correctCount} / {attempt.questionCount}</Text>
                      <Text style={[mockStyles.caption, { marginLeft: "auto" }]}>{formatSeconds(attempt.elapsedSeconds)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <StudyCalendar days={CALENDAR} isEmpty={isEmpty} />
        </View>

        {!isEmpty && (
          <>
            <View style={styles.section}>
              <Text style={mockStyles.sectionTitle}>累計</Text>
              <View style={styles.stats}>
                {[
                  { label: "解いた問題", value: String(totals.passages) },
                  { label: "挑戦した回数", value: String(totals.attempts) },
                  { label: "学習時間", value: formatStudyTime(totals.studyMinutes) },
                  { label: "正答率", value: `${totals.accuracy}%` },
                ].map(item => (
                  <View key={item.label} style={styles.stat}>
                    <Text style={mockStyles.caption}>{item.label}</Text>
                    <Text style={styles.statValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.faintText}>アシストなしの正答率は {totals.noAssistAccuracy}%</Text>
            </View>
            <View style={styles.section}>
              <Text style={mockStyles.sectionTitle}>設問の種類別の正答率</Text>
              {typeAccuracy.map(item => (
                <View key={item.type} style={styles.accuracyRow}>
                  <Text style={styles.accuracyLabel}>{QUESTION_TYPE_LABELS[item.type]}</Text>
                  <View style={styles.accuracyTrack}>
                    <View style={[styles.accuracyFill, { backgroundColor: item.rate < 70 ? "rgba(243, 178, 76, 0.5)" : MOCK_COLORS.amber, width: `${item.rate}%` }]} />
                  </View>
                  <Text style={styles.accuracyValue}>{item.rate}%</Text>
                </View>
              ))}
              <Text style={styles.faintText}>推論の設問が一番苦手です。</Text>
            </View>
          </>
        )}
      </ScrollView>

      <MockStatePanel
        bottom={12}
        current={isEmpty ? "empty" : "normal"}
        states={[
          { href: "/mock/home", key: "normal", label: "通常" },
          { href: "/mock/home?state=empty", key: "empty", label: "まだ 1 問も解いていない" },
        ]}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  accuracyFill: {
    borderRadius: 4,
    height: 8,
  },
  accuracyLabel: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    width: 36,
  },
  accuracyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  accuracyTrack: {
    backgroundColor: MOCK_COLORS.heat0,
    borderRadius: 4,
    flex: 1,
    height: 8,
  },
  accuracyValue: {
    color: MOCK_COLORS.fg,
    fontSize: 13,
    textAlign: "right",
    width: 40,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: MOCK_COLORS.raised,
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  avatarText: {
    color: MOCK_COLORS.fg,
    fontWeight: "600",
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyCard: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.3)",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
  },
  emptyText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  emptyTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 17,
    fontWeight: "600",
  },
  faintText: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
    marginTop: 8,
  },
  goalText: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: MOCK_COLORS.line,
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  lamp: {
    borderRadius: 3,
    flex: 1,
    height: 20,
  },
  lampOff: {
    borderColor: MOCK_COLORS.lineStrong,
    borderWidth: 1,
  },
  lampOn: {
    backgroundColor: MOCK_COLORS.amber,
  },
  lampToday: {
    shadowColor: MOCK_COLORS.amber,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  lamps: {
    flexDirection: "row",
    gap: 4,
    marginTop: 12,
  },
  link: {
    color: MOCK_COLORS.amber,
    fontSize: 14,
    marginTop: 10,
  },
  name: {
    color: MOCK_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
  panelSection: {
    padding: 16,
  },
  recentMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  recentRow: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 10,
  },
  recentTitle: {
    color: MOCK_COLORS.fg,
    fontFamily: MOCK_FONTS.reading,
    fontSize: 15,
  },
  rowBetween: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  section: {
    borderColor: MOCK_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 24,
    paddingTop: 20,
  },
  stat: {
    width: "50%",
  },
  statValue: {
    color: MOCK_COLORS.fg,
    fontSize: 22,
    fontWeight: "600",
    marginTop: 2,
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    rowGap: 16,
  },
  streakNumber: {
    color: MOCK_COLORS.fg,
    fontSize: 30,
    fontWeight: "600",
  },
  streakRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  weekBar: {
    borderRadius: 3,
    flex: 1,
    height: 6,
  },
  weekBars: {
    flexDirection: "row",
    gap: 4,
    marginTop: 8,
  },
  weekValue: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
  },
})
