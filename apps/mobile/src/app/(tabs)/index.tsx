import { useFocusEffect } from "@react-navigation/native"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { useCallback, useRef, useState } from "react"
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { GetUserCalendarResponse, GetUserResponse, GetUserStatsResponse } from "@repo/api-schema"

import { GoalPanel } from "@/components/features/learning-record/GoalPanel"
import { RecentAttempts } from "@/components/features/learning-record/RecentAttempts"
import { StreakPanel } from "@/components/features/learning-record/StreakPanel"
import { StudyCalendar } from "@/components/features/learning-record/StudyCalendar"
import { StudyTotals } from "@/components/features/learning-record/StudyTotals"
import { TypeAccuracy } from "@/components/features/learning-record/TypeAccuracy"
import { appStyles } from "@/components/ui/app-styles"
import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { Wordmark } from "@/components/ui/Wordmark"
import { THEME_COLORS } from "@/const/design-theme"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { userApi } from "@/features/user/user.api"

type HomeData = {
  calendar: GetUserCalendarResponse
  stats: GetUserStatsResponse
  user: GetUserResponse
}

/**
 * パネルに出す最近の挑戦の件数（web は 5 件）
 */
const RECENT_ATTEMPT_COUNT = 3

function UserAvatar({ user }: { user: GetUserResponse | null }) {
  const label = user?.name ?? "ユーザー"
  if (user?.avatar_url) {
    return <Image accessibilityLabel={label} contentFit="cover" source={{ uri: user.avatar_url }} style={styles.avatar} />
  }
  return (
    <View accessibilityLabel={label} accessibilityRole="image" style={styles.avatar}>
      <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? ""}</Text>
    </View>
  )
}

/**
 * マイページ（タブ）。続ける動機になる連続日数と目標のパネルを先に、次にカレンダー・累計・種類別を縦に並べる。
 * 問題を解いて戻ったときに反映させるため、フォーカスのたびに取り直す（フォーカス中にアプリが前面に戻ったときも）
 */
export default function HomeScreen() {
  const router = useRouter()
  const [data, setData] = useState<HomeData | null>(null)
  const [hasError, setHasError] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  /**
   * 取得のたびに進める連番。古い取得の結果が後から届いたら捨てる
   */
  const requestSeqRef = useRef(0)

  const load = useCallback(async (options?: { isPullToRefresh?: boolean }) => {
    const seq = ++requestSeqRef.current
    if (options?.isPullToRefresh) setIsRefreshing(true)
    try {
      const [user, stats, calendar] = await Promise.all([userApi.get(), learningRecordApi.getStats(), learningRecordApi.getCalendar()])
      if (seq !== requestSeqRef.current) return
      setData({ calendar, stats, user })
      setHasError(false)
    } catch (error) {
      if (seq !== requestSeqRef.current) return
      /**
       * 表示中のデータがあれば残す（エラーの表示は初回の取得に失敗したときだけ）
       */
      console.warn("Failed to fetch my page:", error)
      setHasError(true)
    } finally {
      if (seq === requestSeqRef.current) setIsRefreshing(false)
    }
  }, [])

  /**
   * フォーカスのたびと、フォーカス中にアプリが前面に戻ったときに取り直す
   * （タブの画面はアンマウントされないので、バックグラウンドのまま日付をまたいで戻ったときに古い「今日」のままにしない）
   */
  useFocusEffect(
    useCallback(() => {
      void load()
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void load()
      })
      return () => subscription.remove()
    }, [load]),
  )

  const reload = () => {
    setHasError(false)
    void load()
  }

  const openSettings = () => router.navigate("/settings")
  const openAttemptResult = (id: number) => router.push(`/attempts/${id}/result`)
  const solveRandom = () => router.push("/passages/random")

  const isEmpty = data?.stats.totals.attempt_count === 0

  return (
    <SafeAreaView edges={["top"]} style={appStyles.screen}>
      <View style={styles.header}>
        <Wordmark />
        <UserAvatar user={data?.user ?? null} />
      </View>

      {data === null ? (
        hasError ? (
          <View style={styles.center}>
            <Text style={styles.message}>読み込めませんでした。</Text>
            <View style={styles.reload}>
              <SecondaryButton label="再読み込み" onPress={reload} />
            </View>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={THEME_COLORS.amber} />
          </View>
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[THEME_COLORS.amber]}
              refreshing={isRefreshing}
              tintColor={THEME_COLORS.amber}
              onRefresh={() => void load({ isPullToRefresh: true })}
            />
          }
        >
          <Text style={styles.name}>{data.user.name ?? "ユーザー"}</Text>

          {isEmpty ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>最初の 1 問を解いてみましょう</Text>
              <Text style={styles.emptyText}>
                公式ドキュメントや GitHub の英文を読んで、4 択の設問に答えます。1 問 5〜10 分ほどです。解くと、今日のマスに色が付きます。
              </Text>
              <View style={styles.emptyAction}>
                <PrimaryButton label="ランダムに 1 問解く" onPress={solveRandom} />
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              <View style={styles.listAction}>
                <SecondaryButton label="問題一覧" onPress={() => router.navigate("/passages")} />
              </View>
              <View style={styles.randomAction}>
                <PrimaryButton label="ランダムに 1 問解く" onPress={solveRandom} />
              </View>
            </View>
          )}

          <View style={[appStyles.card, styles.panel]}>
            <StreakPanel isEmpty={isEmpty} streak={data.stats.streak} />
            <View style={appStyles.divider} />
            <GoalPanel goal={data.stats.goal} onEdit={openSettings} />
            {!isEmpty && (
              <>
                <View style={appStyles.divider} />
                <RecentAttempts
                  attempts={data.stats.recent_attempts.slice(0, RECENT_ATTEMPT_COUNT)}
                  onPressAttempt={openAttemptResult}
                  onShowAll={() => router.push("/history")}
                />
              </>
            )}
          </View>

          <View style={styles.section}>
            <StudyCalendar calendar={data.calendar} onPressAttempt={openAttemptResult} onPressVocabulary={() => router.navigate("/vocabulary")} />
          </View>

          {!isEmpty && (
            <>
              <View style={styles.section}>
                <StudyTotals noAssist={data.stats.no_assist} totals={data.stats.totals} />
              </View>
              <View style={styles.section}>
                <TypeAccuracy typeAccuracy={data.stats.type_accuracy} weakestQuestionType={data.stats.weakest_question_type} />
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: THEME_COLORS.raised,
    borderColor: THEME_COLORS.lineStrong,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    overflow: "hidden",
    width: 32,
  },
  avatarText: {
    color: THEME_COLORS.fg,
    fontWeight: "600",
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyAction: {
    marginTop: 16,
  },
  emptyCard: {
    backgroundColor: THEME_COLORS.amberWash,
    borderColor: "rgba(243, 178, 76, 0.3)",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
  },
  emptyText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  emptyTitle: {
    color: THEME_COLORS.fg,
    fontSize: 17,
    fontWeight: "600",
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_COLORS.line,
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  listAction: {
    flex: 1,
  },
  message: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    textAlign: "center",
  },
  name: {
    color: THEME_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
  },
  panel: {
    marginTop: 20,
  },
  randomAction: {
    flex: 1.4,
  },
  reload: {
    marginTop: 16,
    minWidth: 160,
  },
  section: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 24,
    paddingTop: 20,
  },
})
