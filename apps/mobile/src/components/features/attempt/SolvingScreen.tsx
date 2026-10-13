import { isAxiosError } from "axios"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, AppState, BackHandler, Platform, StyleSheet, Text, View } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"

import type { InProgressAttempt, SubmitAttemptRequest } from "@repo/api-schema"

import { PassageReader } from "@/components/features/passage/PassageReader"
import { useWordCard, WordCard } from "@/components/features/passage/WordCard"
import { THEME_COLORS } from "@/const/design-theme"
import {
  type AttemptProgress,
  readAttemptProgress,
  type WordLookupRecord,
  writeAttemptProgress,
} from "@/features/attempt/attempt-progress"
import { attemptApi } from "@/features/attempt/attempt.api"
import { useAttemptStore } from "@/features/attempt/attempt.store"
import { useActiveSeconds } from "@/features/attempt/use-active-seconds"
import { useDictionaryLookup } from "@/features/dictionary/use-dictionary-lookup"

import { AttributionNote } from "./AttributionNote"
import { ExpiredNotice } from "./ExpiredNotice"
import { PauseOverlay } from "./PauseOverlay"
import { calculateClosedSheetHeight, QuestionSheet } from "./QuestionSheet"
import { SolvingTopBar } from "./SolvingTopBar"
import { SubmitConfirmModal } from "./SubmitConfirmModal"

type RestoredProgress = Omit<AttemptProgress, "version">

/**
 * 期限（開始から 24 時間）を確かめる間隔
 */
const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000

/**
 * 経過秒数をこの秒数進むごとに端末へ保存する
 */
const SAVE_INTERVAL_SECONDS = 5

/**
 * 提出の word_lookups の上限（submitAttemptRequestSchema の max と同じ）。超えた分は記録しない
 */
const MAX_WORD_LOOKUPS = 300

/**
 * 提出の surface / lemma の長さの上限（submitAttemptRequestSchema と同じ）
 */
const MAX_WORD_LENGTH = 100

/**
 * 本文の下端の余白（閉じた設問シートの上に、最後の段落と出典を出し切るため）
 */
const CONTENT_BOTTOM_SPACE = 60

/**
 * 単語のカードと閉じた設問シートの間
 */
const WORD_CARD_GAP = 16

const isValidWordText = (text: unknown): boolean => typeof text === "string" && text.trim().length > 0 && text.trim().length <= MAX_WORD_LENGTH

/**
 * 提出の検証（source が glossary のときだけ glossary_entry_id を持つ）を通る形か
 */
const isValidWordLookup = (lookup: WordLookupRecord): boolean =>
  isValidWordText(lookup.surface)
  && isValidWordText(lookup.lemma)
  && (lookup.source === "glossary"
    ? Number.isInteger(lookup.glossaryEntryId) && (lookup.glossaryEntryId ?? 0) > 0
    : lookup.source === "dictionary" && lookup.glossaryEntryId === null)

/**
 * 端末に保存した途中経過を読み、いまの挑戦に無い設問・選択肢・ブロックと提出の検証を通らない記録を除く
 * （古い保存や壊れた値のせいで提出できなくならないように。web と同じ）
 */
const restoreProgress = async (attempt: InProgressAttempt, translatableBlockIndexes: Set<number>): Promise<RestoredProgress | null> => {
  const saved = await readAttemptProgress(attempt.id)
  if (saved === null) return null

  const answers: Record<number, number> = {}
  for (const question of attempt.questions) {
    const choiceIndex = saved.answers[question.id]
    if (Number.isInteger(choiceIndex) && choiceIndex >= 0 && choiceIndex < question.choices.length) {
      answers[question.id] = choiceIndex
    }
  }
  return {
    answers,
    elapsedSeconds: Number.isFinite(saved.elapsedSeconds) ? Math.max(0, Math.floor(saved.elapsedSeconds)) : 0,
    translatedBlockIndexes: [...new Set(saved.translatedBlockIndexes)].filter(index => translatableBlockIndexes.has(index)),
    wordLookups: saved.wordLookups.filter(isValidWordLookup).slice(0, MAX_WORD_LOOKUPS),
  }
}

/**
 * 問題を解く画面の本体（挑戦中の挑戦を受け取ってから描画する）。上部バー・本文・設問シート・一時停止・提出の確認を並べる。
 *
 * - タイマーはアプリが前面にあり、端末の途中経過を戻し終え、一時停止・期限切れ・提出中でない間だけ進む
 * - 途中経過（回答・経過秒数・和訳を見た段落・調べた単語）は AsyncStorage に保存する。
 *   回答・アシストが変わったとき、経過秒数が 5 秒進むごと、アプリが前面でなくなったとき、画面を離れるときに書く。
 *   消すのは結果画面（提出に失敗しても回答が残るように）
 */
export function SolvingScreen({ attempt }: { attempt: InProgressAttempt }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const setStoreAttempt = useAttemptStore(state => state.setStoreAttempt)
  const lookupDictionary = useDictionaryLookup()
  const { closeWordCard, showWordCard, wordCard } = useWordCard()
  const { questions } = attempt

  /**
   * 和訳のあるブロック（code 以外）。全文訳で「見た段落」に足す対象
   */
  const translatableBlockIndexes = useMemo(
    () => new Set(attempt.blocks.flatMap((block, index) => (block.type !== "code" && block.translation_ja !== null ? [index] : []))),
    [attempt.blocks],
  )

  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  /**
   * 端末に保存していた経過秒数（タイマーの初期値）
   */
  const [savedSeconds, setSavedSeconds] = useState(0)
  /**
   * 端末の途中経過を戻し終えたか。それまではタイマーを動かさず、保存もしない（保存を 0 で上書きしないため）
   */
  const [isHydrated, setIsHydrated] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  /**
   * いま和訳を表示している段落
   */
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(() => new Set())
  /**
   * 和訳を一度でも見た段落（「訳」・全文訳・長押し。提出の translated_block_count）
   */
  const [viewedTranslationBlocks, setViewedTranslationBlocks] = useState<Set<number>>(() => new Set())
  /**
   * 長押しで和訳を重ねている段落
   */
  const [peekBlock, setPeekBlock] = useState<number | null>(null)
  const [wordLookups, setWordLookups] = useState<WordLookupRecord[]>([])

  const isRunning = isHydrated && !isPaused && !isExpired && !isSubmitting
  const elapsedSeconds = useActiveSeconds({ initialSeconds: savedSeconds, isRunning })
  const timeLimitSeconds = attempt.time_limit_seconds
  const answeredCount = questions.filter(question => answers[question.id] !== undefined).length
  const closedSheetHeight = calculateClosedSheetHeight(insets.bottom)

  /**
   * 保存に使う最新の途中経過（AppState の変化・画面を離れるときにも書くため ref に持つ）。戻し終えるまでは null
   */
  const progressRef = useRef<RestoredProgress | null>(null)
  /**
   * 提出に成功したら、それ以降は保存しない（結果画面が消した途中経過を、この画面の unmount で書き戻さないため）
   */
  const isSubmittedRef = useRef(false)

  /**
   * マウント時に端末の途中経過を戻す。別の端末で始めた挑戦は保存が無いので 0 から（壁時計の上限はサーバーで効く）
   */
  useEffect(() => {
    let isActive = true
    const hydrate = async () => {
      const saved = await restoreProgress(attempt, translatableBlockIndexes)
      if (!isActive) return
      if (saved) {
        setAnswers(saved.answers)
        setSavedSeconds(saved.elapsedSeconds)
        setViewedTranslationBlocks(new Set(saved.translatedBlockIndexes))
        setWordLookups(saved.wordLookups)
        /**
         * 再開したときは最初の未回答の設問から
         */
        setCurrentIndex(Math.max(0, attempt.questions.findIndex(question => saved.answers[question.id] === undefined)))
      }
      setIsHydrated(true)
    }
    void hydrate()
    return () => {
      isActive = false
    }
  }, [attempt, translatableBlockIndexes])

  useEffect(() => {
    progressRef.current = isHydrated
      ? { answers, elapsedSeconds, translatedBlockIndexes: [...viewedTranslationBlocks], wordLookups }
      : null
  })

  const saveProgress = useCallback(() => {
    if (isSubmittedRef.current || progressRef.current === null) return
    void writeAttemptProgress(attempt.id, progressRef.current)
  }, [attempt.id])

  /**
   * 回答・和訳を見た段落・調べた単語が変わったとき
   */
  useEffect(() => {
    if (isHydrated) saveProgress()
  }, [answers, isHydrated, saveProgress, viewedTranslationBlocks, wordLookups])

  /**
   * 経過秒数が 5 秒進むごと（アプリがタスクキルされても 5 秒以内のずれで戻せるように）
   */
  const saveTick = Math.floor(elapsedSeconds / SAVE_INTERVAL_SECONDS)
  useEffect(() => {
    if (isHydrated) saveProgress()
  }, [isHydrated, saveProgress, saveTick])

  /**
   * アプリが前面でなくなったとき（ホームに戻る・画面をロック）と、画面を離れるとき
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") saveProgress()
    })
    return () => {
      subscription.remove()
      saveProgress()
    }
  }, [saveProgress])

  /**
   * 期限（開始から 24 時間）を開いたとき・1 分ごと・アプリに戻ったときに確かめる。端末の時計のずれは server_now で補正する
   */
  useEffect(() => {
    const serverOffsetMs = Date.parse(attempt.server_now) - Date.now()
    const expiresAtMs = Date.parse(attempt.expires_at)
    const checkExpiry = () => {
      if (Date.now() + serverOffsetMs < expiresAtMs) return
      setIsExpired(true)
      setIsConfirmOpen(false)
    }
    checkExpiry()
    const timer = setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS)
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") checkExpiry()
    })
    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [attempt.expires_at, attempt.server_now])

  /**
   * 中断。問題一覧へ戻る（挑戦は残り、24 時間以内なら再開できる。途中経過は unmount で保存する）。
   * 解答画面は開始確認から replace で開くので、スタックにあるタブまで戻して問題タブを開く
   */
  const interrupt = useCallback(() => router.dismissTo("/passages"), [router])

  /**
   * Android の戻るボタンも中断と同じ扱い
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      interrupt()
      return true
    })
    return () => subscription.remove()
  }, [interrupt])

  const chooseAnswer = useCallback((questionId: number, choiceIndex: number) => {
    setAnswers(current => ({ ...current, [questionId]: choiceIndex }))
  }, [])

  const moveQuestion = useCallback((index: number) => {
    setCurrentIndex(Math.min(Math.max(index, 0), questions.length - 1))
  }, [questions.length])

  /**
   * 開くときは単語のカードを閉じる（カードが設問の上に重ならないように）
   */
  const toggleSheet = useCallback(() => {
    if (!isSheetOpen) closeWordCard()
    setIsSheetOpen(!isSheetOpen)
  }, [closeWordCard, isSheetOpen])

  const addViewedTranslationBlock = useCallback((blockIndex: number) => {
    setViewedTranslationBlocks(current => (current.has(blockIndex) ? current : new Set(current).add(blockIndex)))
  }, [])

  const toggleTranslation = useCallback((blockIndex: number) => {
    setTranslatedBlocks((current) => {
      const next = new Set(current)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
    addViewedTranslationBlock(blockIndex)
  }, [addViewedTranslationBlock])

  const toggleAllTranslations = () => {
    if (!showAllTranslations) setViewedTranslationBlocks(current => new Set([...current, ...translatableBlockIndexes]))
    setShowAllTranslations(!showAllTranslations)
  }

  /**
   * 長押しが成立したら軽く振動して、押している間だけ和訳を重ねる。長押しで見た段落も「和訳を見た段落」に数える
   */
  const startPeek = useCallback((blockIndex: number) => {
    if (!translatableBlockIndexes.has(blockIndex)) return
    setPeekBlock(blockIndex)
    addViewedTranslationBlock(blockIndex)
    if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [addViewedTranslationBlock, translatableBlockIndexes])

  const endPeek = useCallback(() => setPeekBlock(null), [])

  /**
   * 同じ単語でも毎回足す（結果画面の一覧はサーバーが重複を除く）
   */
  const recordWordLookup = useCallback((lookup: WordLookupRecord) => {
    if (!isValidWordLookup(lookup)) return
    setWordLookups(current => (current.length >= MAX_WORD_LOOKUPS ? current : [...current, lookup]))
  }, [])

  const openSubmitConfirm = useCallback(() => setIsConfirmOpen(true), [])

  const buildSubmitInput = (): SubmitAttemptRequest => ({
    active_seconds: elapsedSeconds,
    answers: questions.map(question => ({ question_id: question.id, selected_choice_index: answers[question.id] ?? null })),
    translated_block_count: viewedTranslationBlocks.size,
    word_lookups: wordLookups.map(lookup => ({
      glossary_entry_id: lookup.glossaryEntryId,
      lemma: lookup.lemma,
      source: lookup.source,
      surface: lookup.surface,
    })),
  })

  /**
   * 提出する。成功したら結果画面に置き換える（途中経過は結果画面が消す）。期限切れ（409）は期限切れの表示、
   * それ以外の失敗は回答を残したまま知らせる（提出 API は冪等なので再送してよい）
   */
  const submit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const result = await attemptApi.submit(attempt.id, buildSubmitInput())
      isSubmittedRef.current = true
      setStoreAttempt(result)
      setIsConfirmOpen(false)
      router.replace(`/attempts/${attempt.id}/result`)
    } catch (error) {
      setIsSubmitting(false)
      setIsConfirmOpen(false)
      if (isAxiosError(error) && error.response?.status === 409) {
        setIsExpired(true)
        return
      }
      console.warn("Failed to submit attempt:", error)
      Alert.alert("提出できませんでした", "時間をおいて再度お試しください。")
    }
  }

  /**
   * 本文の下の出典とヒント。毎秒のタイマーで作り直さない（FlatList の描き直しを避ける）
   */
  const footer = useMemo(() => (
    <View style={styles.footer}>
      <AttributionNote attribution={attempt.attribution} />
      <Text style={styles.hint}>段落を長押しすると、押している間だけ和訳を表示します。</Text>
    </View>
  ), [attempt.attribution])

  const contentContainerStyle = useMemo(
    () => [styles.content, { paddingBottom: closedSheetHeight + CONTENT_BOTTOM_SPACE }],
    [closedSheetHeight],
  )

  if (isExpired) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
        <ExpiredNotice onBackToList={interrupt} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <SolvingTopBar
        isPaused={isPaused}
        isTimerPending={!isHydrated}
        remainingSeconds={timeLimitSeconds - elapsedSeconds}
        showAllTranslations={showAllTranslations}
        timeLimitSeconds={timeLimitSeconds}
        onInterrupt={interrupt}
        onToggleAllTranslations={toggleAllTranslations}
        onTogglePause={() => setIsPaused(value => !value)}
      />

      <View style={styles.body}>
        <PassageReader
          ListFooterComponent={footer}
          blocks={attempt.blocks}
          contentContainerStyle={contentContainerStyle}
          glossary={attempt.glossary}
          peekBlock={peekBlock}
          showAllTranslations={showAllTranslations}
          translatedBlocks={translatedBlocks}
          onLookupDictionary={lookupDictionary}
          onLookupWord={recordWordLookup}
          onPeekEnd={endPeek}
          onPeekStart={startPeek}
          onToggleTranslation={toggleTranslation}
          onWordCard={showWordCard}
        />

        {wordCard && (
          <View style={[styles.wordCardWrapper, { bottom: closedSheetHeight + WORD_CARD_GAP }]}>
            <WordCard content={wordCard} onClose={closeWordCard} />
          </View>
        )}

        <QuestionSheet
          answers={answers}
          currentIndex={currentIndex}
          isOpen={isSheetOpen}
          questions={questions}
          onChoose={chooseAnswer}
          onMove={moveQuestion}
          onOpenSubmitConfirm={openSubmitConfirm}
          onToggle={toggleSheet}
        />

        {isPaused && <PauseOverlay onResume={() => setIsPaused(false)} />}
      </View>

      <SubmitConfirmModal
        isSubmitting={isSubmitting}
        isVisible={isConfirmOpen}
        unansweredCount={questions.length - answeredCount}
        onCancel={() => setIsConfirmOpen(false)}
        onSubmit={submit}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  content: {
    paddingLeft: 4,
    paddingRight: 20,
    paddingTop: 24,
  },
  footer: {
    borderColor: THEME_COLORS.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    marginLeft: 40,
    marginTop: 16,
    paddingTop: 12,
  },
  hint: {
    color: THEME_COLORS.fgFaint,
    fontSize: 11,
  },
  screen: {
    backgroundColor: THEME_COLORS.canvas,
    flex: 1,
  },
  wordCardWrapper: {
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 35,
  },
})
