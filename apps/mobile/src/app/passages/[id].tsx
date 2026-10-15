import { isAxiosError } from "axios"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { getPassagePathParamSchema, type GetPassageResponse } from "@repo/api-schema"

import { DifficultyMeter } from "@/components/features/passage/DifficultyMeter"
import { ResumeNotice } from "@/components/features/passage/ResumeNotice"
import { SourceMeta } from "@/components/features/passage/SourceMeta"
import { appStyles } from "@/components/ui/app-styles"
import { AppBackdrop } from "@/components/ui/AppBackdrop"
import { PrimaryButton } from "@/components/ui/PrimaryButton"
import { SecondaryButton } from "@/components/ui/SecondaryButton"
import { THEME_COLORS, THEME_FONTS } from "@/const/design-theme"
import { readAttemptProgress } from "@/features/attempt/attempt-progress"
import { attemptApi } from "@/features/attempt/attempt.api"
import { useAttemptStore } from "@/features/attempt/attempt.store"
import { passageApi } from "@/features/passage/passage.api"
import { formatSeconds } from "@/libs/format"

type ResumeSummary = {
  answeredCount: number
  elapsedSeconds: number
  expiryRemainingMs: number
}

type LoadState =
  | { kind: "error" }
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "ready", passage: GetPassageResponse, resume: ResumeSummary | null }

/**
 * 期限内の挑戦中があれば、端末に保存した途中経過から再開の囲みの数字を作る（web の ResumeNotice と同じ計算）
 */
const buildResumeSummary = async (passage: GetPassageResponse): Promise<ResumeSummary | null> => {
  const attempt = passage.in_progress_attempt
  if (!attempt) return null
  const progress = await readAttemptProgress(attempt.id)
  return {
    answeredCount: progress ? Object.keys(progress.answers).length : 0,
    elapsedSeconds: progress?.elapsedSeconds ?? 0,
    /**
     * 端末の時計のずれを補正した現在時刻は `Date.now() + (server_now − 取得時の Date.now())` で、
     * 取得した直後は server_now そのものになる（端末の時計に依存しない）
     */
    expiryRemainingMs: Date.parse(attempt.expires_at) - Date.parse(passage.server_now),
  }
}

/**
 * 開始確認（下から出るモーダル）。本文はまだ見せない。期限内の挑戦中があれば再開の表示にする。
 * 公開を終了した問題（can_start が false。API は自分の挑戦中があるときだけ返す）は「再開する」だけを出し、開始のボタンは出さない
 */
export default function PassageStartScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const parsedId = getPassagePathParamSchema.safeParse({ id: params.id })
  const passageId = parsedId.success ? parsedId.data.id : null
  const setStoreAttempt = useAttemptStore((state) => state.setStoreAttempt)

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" })
  const [reloadCount, setReloadCount] = useState(0)
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    if (passageId === null) return
    let isActive = true
    const load = async () => {
      try {
        const passage = await passageApi.getDetail(passageId)
        const resume = await buildResumeSummary(passage)
        if (isActive) setLoadState({ kind: "ready", passage, resume })
      } catch (error) {
        if (!isActive) return
        if (isAxiosError(error) && error.response?.status === 404) {
          setLoadState({ kind: "notFound" })
          return
        }
        console.warn("Failed to fetch passage:", error)
        setLoadState({ kind: "error" })
      }
    }
    void load()
    return () => {
      isActive = false
    }
  }, [passageId, reloadCount])

  /**
   * 通知などから直接開いて戻り先が無いときは問題タブへ
   */
  const close = () => {
    if (router.canGoBack()) router.back()
    else router.replace("/passages")
  }

  const reload = () => {
    setLoadState({ kind: "loading" })
    setReloadCount(count => count + 1)
  }

  const startAttempt = async (id: number) => {
    setIsStarting(true)
    try {
      const attempt = await attemptApi.start(id)
      setStoreAttempt(attempt)
      router.replace(`/attempts/${attempt.id}`)
    } catch (error) {
      console.warn("Failed to start attempt:", error)
      Alert.alert("開始できませんでした", "時間をおいて再度お試しください。")
    } finally {
      setIsStarting(false)
    }
  }

  /**
   * 不正な ID は API の 404 と同じ表示にする
   */
  const state: LoadState = passageId === null ? { kind: "notFound" } : loadState

  return (
    <SafeAreaView edges={["top", "bottom"]} style={appStyles.screen}>
      <AppBackdrop />
      <View style={styles.grabber} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={close}>
          <Text style={styles.close}>閉じる</Text>
        </Pressable>
      </View>

      {state.kind === "loading" && (
        <View style={styles.center}>
          <ActivityIndicator color={THEME_COLORS.amber} />
        </View>
      )}

      {state.kind === "notFound" && (
        <View style={styles.center}>
          <Text style={styles.message}>この問題は表示できません。</Text>
          <View style={styles.messageAction}>
            <SecondaryButton label="閉じる" onPress={close} />
          </View>
        </View>
      )}

      {state.kind === "error" && (
        <View style={styles.center}>
          <Text style={styles.message}>問題を読み込めませんでした。</Text>
          <View style={styles.messageAction}>
            <SecondaryButton label="再読み込み" onPress={reload} />
          </View>
        </View>
      )}

      {state.kind === "ready" && (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <SourceMeta kind={state.passage.attribution.source_kind} name={state.passage.attribution.source_name} />
            <Text accessibilityRole="header" style={styles.title}>{state.passage.title}</Text>

            <View style={styles.facts}>
              <View style={styles.fact}>
                <Text style={appStyles.caption}>難易度</Text>
                <View style={styles.factMeter}><DifficultyMeter level={state.passage.difficulty} /></View>
              </View>
              <View style={styles.fact}>
                <Text style={appStyles.caption}>英単語数</Text>
                <Text style={styles.factValue}>{state.passage.word_count}<Text style={styles.factUnit}> 語</Text></Text>
              </View>
              <View style={styles.fact}>
                <Text style={appStyles.caption}>制限時間</Text>
                <Text style={styles.factValue}>{formatSeconds(state.passage.time_limit_seconds)}</Text>
              </View>
              <View style={styles.fact}>
                <Text style={appStyles.caption}>設問</Text>
                <Text style={styles.factValue}>{state.passage.question_count}<Text style={styles.factUnit}> 問</Text></Text>
              </View>
            </View>

            {state.resume ? (
              <ResumeNotice
                answeredCount={state.resume.answeredCount}
                canStart={state.passage.can_start}
                elapsedSeconds={state.resume.elapsedSeconds}
                expiryRemainingMs={state.resume.expiryRemainingMs}
                questionCount={state.passage.question_count}
                timeLimitSeconds={state.passage.time_limit_seconds}
              />
            ) : (
              <View style={styles.notes}>
                <Text style={styles.note}>「開始する」を押すとタイマーが動き、本文が表示されます。</Text>
                <Text style={styles.note}>アプリを閉じている間と一時停止中はタイマーが止まります。</Text>
                <Text style={styles.note}>時間が過ぎても解き続けられます（超過時間が記録されます）。</Text>
              </View>
            )}
            <Text style={styles.attribution}>
              出典：{state.passage.attribution.source_name}（{state.passage.attribution.license_spdx}）。一部を抜粋・改変しています。
            </Text>
          </ScrollView>
          {(state.passage.can_start || state.resume) && (
            <View style={styles.footer}>
              <PrimaryButton
                isDisabled={isStarting}
                label={state.resume ? "再開する" : "開始する"}
                onPress={async () => startAttempt(state.passage.id)}
              />
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  attribution: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 24,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  close: {
    color: THEME_COLORS.fgMuted,
    fontSize: 15,
  },
  content: {
    padding: 20,
  },
  fact: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    width: "50%",
  },
  factMeter: {
    marginTop: 6,
  },
  factUnit: {
    color: THEME_COLORS.fgMuted,
    fontSize: 13,
    fontWeight: "400",
  },
  factValue: {
    color: THEME_COLORS.fg,
    fontSize: 20,
    fontWeight: "600",
    marginTop: 4,
  },
  facts: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_COLORS.line,
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 20,
  },
  footer: {
    padding: 16,
  },
  grabber: {
    alignSelf: "center",
    backgroundColor: THEME_COLORS.lineStrong,
    borderRadius: 2,
    height: 4,
    marginTop: 8,
    width: 40,
  },
  header: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  message: {
    color: THEME_COLORS.fg,
    fontSize: 15,
    textAlign: "center",
  },
  messageAction: {
    marginTop: 16,
    minWidth: 160,
  },
  note: {
    color: THEME_COLORS.fgMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  notes: {
    gap: 6,
    marginTop: 20,
  },
  title: {
    color: THEME_COLORS.fg,
    fontFamily: THEME_FONTS.readingSemiBold,
    fontSize: 28,
    lineHeight: 36,
    marginTop: 12,
  },
})
