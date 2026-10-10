import { Ionicons } from "@expo/vector-icons"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { MockStatePanel } from "@/components/mock/MockStatePanel"
import { mockStyles, PrimaryButton, Segment } from "@/components/mock/parts"
import { MOCK_COLORS } from "@/const/mock-theme"
import { MOCK_REMINDER, MOCK_STATS } from "@/libs/mock-data"

const WEEKDAYS = [
  { label: "月", value: 1 },
  { label: "火", value: 2 },
  { label: "水", value: 3 },
  { label: "木", value: 4 },
  { label: "金", value: 5 },
  { label: "土", value: 6 },
  { label: "日", value: 7 },
]

const GOAL_TEXT_MAX = 200

const shiftTime = (time: string, minutes: number): string => {
  const [hour, minute] = time.split(":").map(Number)
  const total = (hour * 60 + minute + minutes + 24 * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

/**
 * 設定（モック）。目標・リマインダー・タイムゾーン・アカウント・危険な操作
 */
export default function MockSettingsScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ state?: string }>()
  const isPermissionDenied = params.state === "denied"

  const [goalText, setGoalText] = useState(MOCK_STATS.goal.goalText)
  const [metric, setMetric] = useState<"minutes" | "none" | "passages">("passages")
  const [isSaved, setIsSaved] = useState(false)
  const [isReminderEnabled, setIsReminderEnabled] = useState(MOCK_REMINDER.isEnabled)
  const [weekdays, setWeekdays] = useState<number[]>(MOCK_REMINDER.weekdays)
  const [time, setTime] = useState(MOCK_REMINDER.time)

  return (
    <SafeAreaView edges={["top"]} style={mockStyles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>設定</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>目標</SectionTitle>
        <View style={mockStyles.card}>
          <View style={styles.cardBody}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>目標</Text>
              <Text style={[styles.counter, goalText.length > GOAL_TEXT_MAX && { color: MOCK_COLORS.wrong }]}>{goalText.length} / {GOAL_TEXT_MAX}</Text>
            </View>
            <TextInput
              multiline
              onChangeText={(value) => {
                setGoalText(value)
                setIsSaved(false)
              }}
              placeholder="例：英語の公式ドキュメントを辞書なしで読めるようになる"
              placeholderTextColor={MOCK_COLORS.fgFaint}
              style={[styles.input, styles.textArea]}
              value={goalText}
            />
            <Text style={[styles.label, { marginTop: 16 }]}>目標日</Text>
            <Pressable style={styles.input}>
              <Text style={styles.inputText}>{MOCK_STATS.goal.targetDate.replaceAll("-", "/")}</Text>
            </Pressable>
            <Text style={[styles.label, { marginTop: 16 }]}>週の目標</Text>
            <Text style={styles.hint}>週は月曜日から始まります。</Text>
            <View style={{ marginTop: 8 }}>
              <Segment
                onChange={(value) => {
                  setMetric(value)
                  setIsSaved(false)
                }}
                options={[{ key: "none", label: "設定しない" }, { key: "passages", label: "問題数" }, { key: "minutes", label: "学習時間" }]}
                value={metric}
              />
            </View>
            {metric !== "none" && (
              <View style={styles.weeklyRow}>
                <Text style={styles.hint}>週に</Text>
                <TextInput
                  key={metric}
                  defaultValue={metric === "passages" ? String(MOCK_STATS.goal.weeklyTarget) : "60"}
                  keyboardType="number-pad"
                  style={[styles.input, styles.numberInput]}
                />
                <Text style={styles.hint}>{metric === "passages" ? "問" : "分"}</Text>
              </View>
            )}
            <View style={{ marginTop: 18 }}><PrimaryButton label="目標を保存" onPress={() => setIsSaved(true)} /></View>
            {isSaved && <Text style={styles.saved}>目標を保存しました</Text>}
          </View>
        </View>

        <SectionTitle>リマインダー</SectionTitle>
        <View style={mockStyles.card}>
          {isPermissionDenied && isReminderEnabled && (
            <View style={styles.permission}>
              <Ionicons color={MOCK_COLORS.amber} name="notifications-off-outline" size={18} />
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionTitle}>通知が許可されていません</Text>
                <Text style={styles.permissionText}>リマインダーを受け取るには、OS の設定でこのアプリの通知を許可してください。</Text>
                <Pressable style={styles.permissionButton}><Text style={styles.permissionButtonText}>設定を開く</Text></Pressable>
              </View>
            </View>
          )}
          <View style={[styles.cardBody, styles.rowBetween, { alignItems: "center" }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>学習のリマインダー</Text>
              <Text style={styles.hint}>決めた曜日と時刻に「今日の 1 問」を通知します。</Text>
            </View>
            <Switch
              onValueChange={setIsReminderEnabled}
              thumbColor={isReminderEnabled ? MOCK_COLORS.amberInk : MOCK_COLORS.fg}
              trackColor={{ false: MOCK_COLORS.heat0, true: MOCK_COLORS.amber }}
              value={isReminderEnabled}
            />
          </View>
          {isReminderEnabled && (
            <>
              <View style={mockStyles.divider} />
              <View style={styles.cardBody}>
                <Text style={styles.label}>曜日</Text>
                <View style={styles.weekdays}>
                  {WEEKDAYS.map(day => {
                    const isActive = weekdays.includes(day.value)
                    return (
                      <Pressable
                        key={day.value}
                        accessibilityState={{ selected: isActive }}
                        onPress={() => setWeekdays(value => (isActive ? (value.length > 1 ? value.filter(item => item !== day.value) : value) : [...value, day.value]))}
                        style={[styles.weekday, isActive && styles.weekdayActive]}
                      >
                        <Text style={[styles.weekdayText, isActive && { color: MOCK_COLORS.amberInk }]}>{day.label}</Text>
                      </Pressable>
                    )
                  })}
                </View>
                <Text style={[styles.label, { marginTop: 16 }]}>時刻</Text>
                <View style={styles.timeRow}>
                  <Pressable accessibilityLabel="15 分早める" onPress={() => setTime(value => shiftTime(value, -15))} style={styles.timeButton}>
                    <Ionicons color={MOCK_COLORS.fg} name="remove" size={18} />
                  </Pressable>
                  <Text style={styles.timeValue}>{time}</Text>
                  <Pressable accessibilityLabel="15 分遅らせる" onPress={() => setTime(value => shiftTime(value, 15))} style={styles.timeButton}>
                    <Ionicons color={MOCK_COLORS.fg} name="add" size={18} />
                  </Pressable>
                </View>
                <Text style={styles.hint}>端末の時刻で通知します。今日すでに学習していても通知は届きます。</Text>
              </View>
            </>
          )}
        </View>

        <SectionTitle>タイムゾーン</SectionTitle>
        <Pressable style={[mockStyles.card, styles.cardBody, styles.rowBetween, { alignItems: "center" }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Asia/Tokyo</Text>
            <Text style={styles.hint}>学習した日付はこのタイムゾーンで決まります。</Text>
          </View>
          <Ionicons color={MOCK_COLORS.fgFaint} name="chevron-forward" size={18} />
        </Pressable>

        <SectionTitle>アカウント</SectionTitle>
        <Pressable style={[mockStyles.card, styles.cardBody]}>
          <Text style={styles.rowTitle}>ログアウト</Text>
        </Pressable>

        <View style={styles.danger}>
          <Text style={styles.dangerTitle}>危険な操作</Text>
          <View style={styles.dangerBody}>
            <Text style={styles.rowTitle}>アカウントを削除する</Text>
            <Text style={styles.hint}>学習の記録・目標・リマインダーの設定がすべて削除され、元に戻せません。</Text>
            <Pressable onPress={() => router.push("/mock/delete-account")} style={styles.dangerButton}>
              <Text style={styles.dangerButtonText}>アカウントを削除</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <MockStatePanel
        bottom={12}
        current={isPermissionDenied ? "denied" : "normal"}
        states={[
          { href: "/mock/settings", key: "normal", label: "通常" },
          { href: "/mock/settings?state=denied", key: "denied", label: "通知が許可されていない" },
        ]}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  cardBody: {
    padding: 16,
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  counter: {
    color: MOCK_COLORS.fgFaint,
    fontSize: 12,
  },
  danger: {
    borderColor: "rgba(240, 140, 140, 0.4)",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 28,
  },
  dangerBody: {
    padding: 16,
  },
  dangerButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "rgba(240, 140, 140, 0.6)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dangerButtonText: {
    color: MOCK_COLORS.wrong,
    fontSize: 14,
  },
  dangerTitle: {
    borderBottomWidth: 1,
    borderColor: "rgba(240, 140, 140, 0.3)",
    color: MOCK_COLORS.wrong,
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  header: {
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  hint: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  input: {
    backgroundColor: MOCK_COLORS.canvas,
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: MOCK_COLORS.fg,
    fontSize: 15,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputText: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
  },
  label: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
  },
  numberInput: {
    marginTop: 0,
    textAlign: "right",
    width: 72,
  },
  permission: {
    backgroundColor: MOCK_COLORS.amberWash,
    borderBottomWidth: 1,
    borderColor: "rgba(243, 178, 76, 0.3)",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  permissionButton: {
    alignSelf: "flex-start",
    backgroundColor: MOCK_COLORS.amber,
    borderRadius: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  permissionButtonText: {
    color: MOCK_COLORS.amberInk,
    fontSize: 13,
    fontWeight: "700",
  },
  permissionText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  permissionTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 14,
    fontWeight: "500",
  },
  rowBetween: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  rowTitle: {
    color: MOCK_COLORS.fg,
    fontSize: 15,
  },
  saved: {
    color: MOCK_COLORS.correct,
    fontSize: 13,
    marginTop: 8,
  },
  sectionTitle: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 13,
    marginBottom: 8,
    marginTop: 24,
  },
  textArea: {
    lineHeight: 22,
    minHeight: 76,
    textAlignVertical: "top",
  },
  timeButton: {
    alignItems: "center",
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 44,
  },
  timeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    marginBottom: 6,
    marginTop: 8,
  },
  timeValue: {
    color: MOCK_COLORS.fg,
    fontSize: 26,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    minWidth: 86,
    textAlign: "center",
  },
  title: {
    color: MOCK_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
  weekday: {
    alignItems: "center",
    borderColor: MOCK_COLORS.lineStrong,
    borderRadius: 20,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  weekdayActive: {
    backgroundColor: MOCK_COLORS.amber,
    borderColor: MOCK_COLORS.amber,
  },
  weekdayText: {
    color: MOCK_COLORS.fgMuted,
    fontSize: 14,
  },
  weekdays: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  weeklyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
})
