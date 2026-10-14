import { isAxiosError } from "axios"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { getAttemptPathParamSchema, type GetAttemptResponse } from "@repo/api-schema"

import { ExpiredNotice } from "@/components/features/attempt/ExpiredNotice"
import { SolvingScreen } from "@/components/features/attempt/SolvingScreen"
import { appStyles } from "@/components/ui/app-styles"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS } from "@/const/design-theme"
import { removeAttemptProgress } from "@/features/attempt/attempt-progress"
import { attemptApi } from "@/features/attempt/attempt.api"
import { useAttemptStore } from "@/features/attempt/attempt.store"

type LoadState =
  | { kind: "error" }
  | { kind: "loading" }
  | { kind: "notFound" }
  | { attempt: GetAttemptResponse, kind: "ready" }

/**
 * 開始確認が入れた挑戦（attempt.store）があればそれで描画する（通信を待たない）。
 * ストアの値は開いたときに 1 回だけ読む（提出でストアが結果に変わっても、この画面は描き直さない）
 */
const readInitialState = (attemptId: number | null): LoadState => {
  if (attemptId === null) return { kind: "notFound" }
  const attempt = useAttemptStore.getState().attemptsById[attemptId]
  return attempt ? { attempt, kind: "ready" } : { kind: "loading" }
}

/**
 * 問題を解く画面。挑戦を読み込み、挑戦中なら解答画面の本体（SolvingScreen）を出す。
 * 提出済みなら結果画面に置き換え、期限切れなら期限切れの表示にする
 */
export default function AttemptScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const parsedId = getAttemptPathParamSchema.safeParse({ id: params.id })
  const attemptId = parsedId.success ? parsedId.data.id : null
  const setStoreAttempt = useAttemptStore(state => state.setStoreAttempt)

  const [loadState, setLoadState] = useState<LoadState>(() => readInitialState(attemptId))

  useEffect(() => {
    if (attemptId === null || loadState.kind !== "loading") return
    let isActive = true
    const load = async () => {
      try {
        const attempt = await attemptApi.getDetail(attemptId)
        if (!isActive) return
        setStoreAttempt(attempt)
        setLoadState({ attempt, kind: "ready" })
      } catch (error) {
        if (!isActive) return
        if (isAxiosError(error) && error.response?.status === 404) {
          setLoadState({ kind: "notFound" })
          return
        }
        console.warn("Failed to fetch attempt:", error)
        setLoadState({ kind: "error" })
      }
    }
    void load()
    return () => {
      isActive = false
    }
  }, [attemptId, loadState.kind, setStoreAttempt])

  const isSubmitted = loadState.kind === "ready" && loadState.attempt.status === "submitted"
  const isExpired = loadState.kind === "ready" && loadState.attempt.status === "expired"

  /**
   * 提出済みの挑戦は結果画面へ
   */
  useEffect(() => {
    if (isSubmitted && attemptId !== null) router.replace(`/attempts/${attemptId}/result`)
  }, [attemptId, isSubmitted, router])

  /**
   * 期限切れの挑戦はもう提出できないので、端末の途中経過を消す
   */
  useEffect(() => {
    if (isExpired && attemptId !== null) void removeAttemptProgress(attemptId)
  }, [attemptId, isExpired])

  const backToList = () => router.dismissTo("/passages")

  const reload = () => setLoadState({ kind: "loading" })

  if (loadState.kind === "ready" && loadState.attempt.status === "in_progress") {
    return <SolvingScreen attempt={loadState.attempt} />
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      {isExpired && <ExpiredNotice onBackToList={backToList} />}

      {(loadState.kind === "loading" || isSubmitted) && (
        <View style={styles.center}>
          <ActivityIndicator color={THEME_COLORS.amber} />
        </View>
      )}

      {loadState.kind === "notFound" && (
        <View style={styles.center}>
          <Text style={styles.message}>この挑戦は表示できません。</Text>
          <View style={styles.action}>
            <SecondaryButton label="問題一覧へ" onPress={backToList} />
          </View>
        </View>
      )}

      {loadState.kind === "error" && (
        <View style={styles.center}>
          <Text style={styles.message}>挑戦を読み込めませんでした。</Text>
          <View style={styles.action}>
            <SecondaryButton label="再読み込み" onPress={reload} />
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  action: {
    marginTop: 16,
    minWidth: 160,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  message: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    textAlign: "center",
  },
})
