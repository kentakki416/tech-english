import { Ionicons } from "@expo/vector-icons"
import { useRouter } from "expo-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { LearningRecordAttemptResponse } from "@repo/api-schema"

import { appStyles } from "@/components/ui/app-styles"
import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { formatDateHeading, formatSeconds } from "@/libs/format"

type LoadState = "error" | "loading" | "ready"

type HistorySection = { data: LearningRecordAttemptResponse[], date: string }

/**
 * 上部バーの左（「‹ マイページ」）と右の余白の幅。画面名を中央に置くため左右で揃える。
 * モックの 80 では矢印と 5 文字が収まらず 2 行に折り返すので広げている
 */
const HEADER_SIDE_WIDTH = 100

/**
 * 学習した日（study_date）ごとにまとめる。並びは受け取った順（提出日時の新しい順）のまま
 */
const groupAttemptsByStudyDate = (attempts: LearningRecordAttemptResponse[]): HistorySection[] => {
  const groups = new Map<string, LearningRecordAttemptResponse[]>()
  for (const attempt of attempts) {
    const group = groups.get(attempt.study_date)
    if (group) group.push(attempt)
    else groups.set(attempt.study_date, [attempt])
  }
  return Array.from(groups, ([date, data]) => ({ data, date }))
}

/**
 * 学習履歴（マイページの「すべて見る」から開くスタックの画面）。提出した挑戦を日付ごとに並べ、
 * 下端までスクロールすると続き（next_cursor）を取得して後ろに足す
 */
export default function HistoryScreen() {
  const router = useRouter()
  const [attempts, setAttempts] = useState<LearningRecordAttemptResponse[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  /**
   * 続きを取りに行っている間は重ねない（onEndReached は描画の前に続けて呼ばれることがある）
   */
  const isLoadingMoreRef = useRef(false)
  const sections = useMemo(() => groupAttemptsByStudyDate(attempts), [attempts])

  const loadFirstPage = useCallback(async () => {
    try {
      const page = await learningRecordApi.getAttempts()
      setAttempts(page.attempts)
      setNextCursor(page.next_cursor)
      setLoadState("ready")
    } catch (error) {
      console.warn("Failed to fetch attempt history:", error)
      setLoadState("error")
    }
  }, [])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const reload = () => {
    setLoadState("loading")
    void loadFirstPage()
  }

  const loadMore = async () => {
    if (nextCursor === null || isLoadingMoreRef.current) return
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const page = await learningRecordApi.getAttempts({ cursor: nextCursor })
      /**
       * 同じ挑戦を 2 回出さない（念のため id で重複を除く）
       */
      setAttempts(current => {
        const ids = new Set(current.map(attempt => attempt.id))
        return [...current, ...page.attempts.filter(attempt => !ids.has(attempt.id))]
      })
      setNextCursor(page.next_cursor)
    } catch (error) {
      /**
       * 失敗しても一覧はそのまま。もう一度下端までスクロールすると onEndReached から再び取りに行く
       */
      console.warn("Failed to fetch more attempt history:", error)
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={appStyles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={8} style={styles.back} onPress={() => router.back()}>
          <Ionicons color={THEME_COLORS.fgMuted} name="chevron-back" size={18} />
          <Text style={styles.backText}>マイページ</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>学習履歴</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loadState === "loading" && (
        <View style={styles.center}>
          <ActivityIndicator color={THEME_COLORS.amber} />
        </View>
      )}

      {loadState === "error" && (
        <View style={styles.center}>
          <Text style={styles.message}>読み込めませんでした。</Text>
          <View style={styles.reload}>
            <SecondaryButton label="再読み込み" onPress={reload} />
          </View>
        </View>
      )}

      {loadState === "ready" && (
        <SectionList
          ListEmptyComponent={<Text style={styles.empty}>まだ提出した挑戦はありません。</Text>}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={THEME_COLORS.amber} style={styles.loadingMore} /> : null}
          contentContainerStyle={styles.list}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/attempts/${item.id}/result`)}
            >
              <Text style={styles.time}>{item.submitted_time}</Text>
              <View style={styles.rowBody}>
                <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
                <View style={styles.rowMeta}>
                  <ScoreSquares results={Array.from({ length: item.question_count }, (_, index) => index < item.correct_count)} />
                  <Text style={styles.metaText}>{item.correct_count}/{item.question_count}</Text>
                  <Text style={[styles.metaText, item.is_overtime && styles.overtime]}>
                    {formatSeconds(item.elapsed_seconds)}{item.is_overtime ? " 超過" : ""}
                  </Text>
                  <Text style={styles.faint}>{item.used_assist ? "アシストあり" : "アシストなし"}</Text>
                </View>
              </View>
            </Pressable>
          )}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{formatDateHeading(section.date)}</Text>}
          sections={sections}
          stickySectionHeadersEnabled={false}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  back: {
    alignItems: "center",
    flexDirection: "row",
    width: HEADER_SIDE_WIDTH,
  },
  backText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  empty: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    paddingTop: 40,
    textAlign: "center",
  },
  faint: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
    marginLeft: "auto",
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_COLORS.line,
    flexDirection: "row",
    height: 52,
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  headerSpacer: {
    width: HEADER_SIDE_WIDTH,
  },
  list: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  loadingMore: {
    marginVertical: 16,
  },
  message: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    textAlign: "center",
  },
  metaText: {
    color: THEME_COLORS.fgMuted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  overtime: {
    color: THEME_COLORS.wrong,
  },
  reload: {
    marginTop: 16,
    minWidth: 160,
  },
  row: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  rowBody: {
    flex: 1,
  },
  rowMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 5,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowTitle: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.reading,
    fontSize: 16,
  },
  sectionHeader: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    paddingBottom: 6,
    paddingTop: 22,
  },
  time: {
    color: THEME_COLORS.fgFaint,
    fontSize: 12,
    paddingTop: 3,
    width: 40,
  },
  title: {
    color: THEME_COLORS.fg,
    fontSize: 16,
    fontWeight: "600",
  },
})
