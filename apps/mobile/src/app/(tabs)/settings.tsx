import { Ionicons } from "@expo/vector-icons"
import { useFocusEffect } from "@react-navigation/native"
import { useRouter } from "expo-router"
import { useCallback, useRef, useState } from "react"
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { GetUserGoalResponse } from "@repo/api-schema"

import { GoalForm } from "@/components/features/learning-record/GoalForm"
import { TimezonePickerModal } from "@/components/features/learning-record/TimezonePickerModal"
import { ReminderSection } from "@/components/features/study-reminder/ReminderSection"
import { appStyles } from "@/components/ui/app-styles"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS } from "@/const/design-theme"
import { signOut } from "@/features/auth/auth.session"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { userApi } from "@/features/user/user.api"

type SettingsData = {
  goal: GetUserGoalResponse["goal"]
  timezone: string
}

function SectionTitle({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>
}

/**
 * 設定（タブ）。区画の順は「目標 → リマインダー → タイムゾーン → アカウント → 危険な操作」。
 * 目標とタイムゾーンはフォーカスのたびに取り直す（取り直した値で目標のフォームを作り直す）
 */
export default function SettingsScreen() {
  const router = useRouter()
  const [data, setData] = useState<SettingsData | null>(null)
  const [hasError, setHasError] = useState(false)
  /**
   * 取得のたびに進める。目標のフォームの key にして、取得した値を初期値に作り直す
   */
  const [loadCount, setLoadCount] = useState(0)
  const [isTimezonePickerVisible, setIsTimezonePickerVisible] = useState(false)
  const [isSavingTimezone, setIsSavingTimezone] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const requestSeqRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current
    try {
      const [{ goal }, user] = await Promise.all([learningRecordApi.getGoal(), userApi.get()])
      if (seq !== requestSeqRef.current) return
      setData({ goal, timezone: user.timezone })
      setLoadCount(count => count + 1)
      setHasError(false)
    } catch (error) {
      if (seq !== requestSeqRef.current) return
      /**
       * 表示中のデータがあれば残す（エラーの表示は初回の取得に失敗したときだけ）
       */
      console.warn("Failed to fetch settings:", error)
      setHasError(true)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const reload = () => {
    setHasError(false)
    void load()
  }

  /**
   * 選んだタイムゾーンをその場で保存する。成功したらモーダルを閉じ、失敗したら知らせて元の値に戻す
   */
  const changeTimezone = async (next: string) => {
    if (data === null) return
    const previous = data.timezone
    if (next === previous) {
      setIsTimezonePickerVisible(false)
      return
    }
    setData({ ...data, timezone: next })
    setIsSavingTimezone(true)
    try {
      const user = await userApi.updateTimezone(next)
      setData(current => (current ? { ...current, timezone: user.timezone } : current))
      setIsTimezonePickerVisible(false)
    } catch (error) {
      console.warn("Failed to update timezone:", error)
      setData(current => (current ? { ...current, timezone: previous } : current))
      Alert.alert("タイムゾーンを保存できませんでした", "時間をおいて再度お試しください。")
    } finally {
      setIsSavingTimezone(false)
    }
  }

  /**
   * ログアウトするとログイン状態が変わり、ルートレイアウトの Stack.Protected がログイン画面へ移す
   */
  const pressSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={appStyles.screen}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>設定</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {data === null ? (
          hasError ? (
            <View style={styles.status}>
              <Text style={styles.message}>読み込めませんでした。</Text>
              <View style={styles.reload}>
                <SecondaryButton label="再読み込み" onPress={reload} />
              </View>
            </View>
          ) : (
            <View style={styles.status}>
              <ActivityIndicator color={THEME_COLORS.amber} />
            </View>
          )
        ) : (
          <>
            <SectionTitle>目標</SectionTitle>
            <GoalForm key={loadCount} goal={data.goal} />

            <SectionTitle>リマインダー</SectionTitle>
            <ReminderSection />

            <SectionTitle>タイムゾーン</SectionTitle>
            <Pressable
              accessibilityHint="タイムゾーンを選び直す"
              accessibilityRole="button"
              style={({ pressed }) => [appStyles.card, styles.cardBody, styles.rowBetween, pressed && styles.cardPressed]}
              onPress={() => setIsTimezonePickerVisible(true)}
            >
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{data.timezone}</Text>
                <Text style={styles.hint}>学習した日付はこのタイムゾーンで決まります。</Text>
              </View>
              <Ionicons color={THEME_COLORS.fgFaint} name="chevron-forward" size={18} />
            </Pressable>
            <TimezonePickerModal
              currentTimezone={data.timezone}
              isSaving={isSavingTimezone}
              isVisible={isTimezonePickerVisible}
              onClose={() => setIsTimezonePickerVisible(false)}
              onSelect={next => void changeTimezone(next)}
            />
          </>
        )}

        <SectionTitle>アカウント</SectionTitle>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isSigningOut }}
          disabled={isSigningOut}
          style={({ pressed }) => [appStyles.card, styles.cardBody, pressed && styles.cardPressed, isSigningOut && styles.disabled]}
          onPress={() => void pressSignOut()}
        >
          <Text style={styles.rowTitle}>{isSigningOut ? "ログアウトしています…" : "ログアウト"}</Text>
        </Pressable>

        <View style={styles.danger}>
          <Text accessibilityRole="header" style={styles.dangerTitle}>危険な操作</Text>
          <View style={styles.dangerBody}>
            <Text style={styles.rowTitle}>アカウントを削除する</Text>
            <Text style={styles.hint}>学習の記録・目標・リマインダーの設定がすべて削除され、元に戻せません。</Text>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.dangerButton, pressed && styles.dangerButtonPressed]}
              onPress={() => router.push("/settings/delete-account")}
            >
              <Text style={styles.dangerButtonText}>アカウントを削除</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  cardBody: {
    padding: 16,
  },
  cardPressed: {
    backgroundColor: THEME_COLORS.raised,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  dangerButtonPressed: {
    backgroundColor: THEME_COLORS.wrongWash,
  },
  dangerButtonText: {
    color: THEME_COLORS.wrong,
    fontSize: 14,
  },
  dangerTitle: {
    borderBottomWidth: 1,
    borderColor: "rgba(240, 140, 140, 0.3)",
    color: THEME_COLORS.wrong,
    fontSize: 15,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disabled: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
  },
  header: {
    height: 56,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  hint: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  message: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    textAlign: "center",
  },
  reload: {
    marginTop: 16,
    minWidth: 160,
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  rowTitle: {
    color: THEME_COLORS.fg,
    fontSize: 15,
  },
  sectionTitle: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    marginBottom: 8,
    marginTop: 24,
  },
  status: {
    alignItems: "center",
    paddingVertical: 40,
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
})
