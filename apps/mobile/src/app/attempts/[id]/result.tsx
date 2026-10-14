import { isAxiosError } from "axios"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { getAttemptPathParamSchema, type GetAttemptResponse } from "@repo/api-schema"

import { ResultScreen } from "@/components/features/attempt/ResultScreen"
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
 * 提出が入れた結果（attempt.store）があればそれで描画する（提出の直後は通信を待たない）。
 * ストアに無い・まだ挑戦中の値しか無いとき（学習履歴から開いた・アプリを再起動した）は取得する
 */
const readInitialState = (attemptId: number | null): LoadState => {
  if (attemptId === null) return { kind: "notFound" }
  const attempt = useAttemptStore.getState().attemptsById[attemptId]
  return attempt?.status === "submitted" ? { attempt, kind: "ready" } : { kind: "loading" }
}

/**
 * 結果・解説。挑戦を読み込み、提出済みなら結果画面の本体（ResultScreen）を出す。
 * 挑戦中なら解答画面に置き換え、期限切れなら問題一覧へ戻る。提出済みを表示したら端末の途中経過を消す
 */
export default function AttemptResultScreen() {
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
        console.warn("Failed to fetch attempt result:", error)
        setLoadState({ kind: "error" })
      }
    }
    void load()
    return () => {
      isActive = false
    }
  }, [attemptId, loadState.kind, setStoreAttempt])

  const status = loadState.kind === "ready" ? loadState.attempt.status : null

  /**
   * 提出済みなら端末の途中経過を消す（解答画面の提出では消さない。提出に失敗しても回答が残るように）。
   * まだ挑戦中なら解答画面へ（途中経過は消さない）、期限切れなら問題一覧へ
   */
  useEffect(() => {
    if (attemptId === null || status === null) return
    if (status === "submitted") void removeAttemptProgress(attemptId)
    else if (status === "in_progress") router.replace(`/attempts/${attemptId}`)
    else router.dismissTo("/passages")
  }, [attemptId, router, status])

  const backToList = () => router.dismissTo("/passages")

  const reload = () => setLoadState({ kind: "loading" })

  if (loadState.kind === "ready" && loadState.attempt.status === "submitted") {
    return <ResultScreen result={loadState.attempt} />
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      {(loadState.kind === "loading" || loadState.kind === "ready") && (
        <View style={styles.center}>
          <ActivityIndicator color={THEME_COLORS.amber} />
        </View>
      )}

      {loadState.kind === "notFound" && (
        <View style={styles.center}>
          <Text style={styles.message}>この結果は表示できません。</Text>
          <View style={styles.action}>
            <SecondaryButton label="問題一覧へ" onPress={backToList} />
          </View>
        </View>
      )}

      {loadState.kind === "error" && (
        <View style={styles.center}>
          <Text style={styles.message}>結果を読み込めませんでした。</Text>
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
