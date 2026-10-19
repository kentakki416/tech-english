import { isAxiosError } from "axios"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState, BackHandler, type FlatList, Platform, StyleSheet, Text, View } from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"

import {
  type AttemptBlock,
  type InProgressAttempt,
  SUBMIT_ATTEMPT_MAX_WORD_LENGTH,
  SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS,
  type SubmitAttemptRequest,
} from "@repo/api-schema"

import { PassageReader, type ReaderReadAloud } from "@/components/features/passage/PassageReader"
import { useWordCard, WordCard } from "@/components/features/passage/WordCard"
import {
  READ_ALOUD_BAR_GAP,
  READ_ALOUD_BAR_SPACE,
  ReadAloudBar,
  ReturnToReadingButton,
} from "@/components/features/read-aloud/ReadAloudBar"
import { THEME_COLORS } from "@/const/design-theme"
import {
  type AttemptProgress,
  readAttemptProgress,
  removeAttemptProgress,
  type WordLookupRecord,
  writeAttemptProgress,
} from "@/features/attempt/attempt-progress"
import { attemptApi } from "@/features/attempt/attempt.api"
import { useAttemptStore } from "@/features/attempt/attempt.store"
import { useDictionaryLookup } from "@/features/dictionary/use-dictionary-lookup"
import { useReadAloud } from "@/features/read-aloud/use-read-aloud"
import { useReadingAutoScroll } from "@/features/read-aloud/use-reading-auto-scroll"
import { useSoundEffects } from "@/features/sound-effect/use-sound-effects"
import { useActiveSeconds } from "@/libs/use-active-seconds"

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

const SUBMIT_FAILED_MESSAGE = "提出できませんでした。時間をおいて再度お試しください。"

/**
 * 本文の下端の余白（閉じた設問シートと読み上げのミニプレーヤーの上に、最後の段落と出典を出し切るため）
 */
const CONTENT_BOTTOM_SPACE = 60

const isValidWordText = (text: unknown): boolean => typeof text === "string" && text.trim().length > 0 && text.trim().length <= SUBMIT_ATTEMPT_MAX_WORD_LENGTH

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
 * （古い保存や壊れた値のせいで提出できなくならないように。web と同じ）。聞いた段落は読み上げより前の保存には無い
 */
const restoreProgress = async (
  attempt: InProgressAttempt,
  blockIndexes: { readable: Set<number>, translatable: Set<number> },
): Promise<RestoredProgress | null> => {
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
    listenedBlockIndexes: [...new Set(saved.listenedBlockIndexes)].filter(index => blockIndexes.readable.has(index)),
    translatedBlockIndexes: [...new Set(saved.translatedBlockIndexes)].filter(index => blockIndexes.translatable.has(index)),
    wordLookups: saved.wordLookups.filter(isValidWordLookup).slice(0, SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS),
  }
}

/**
 * 問題を解く画面の本体（挑戦中の挑戦を受け取ってから描画する）。上部バー・本文・設問シート・一時停止・提出の確認を並べる。
 *
 * - タイマーはアプリが前面にあり、端末の途中経過を戻し終え、一時停止・期限切れ・提出中でない間だけ進む
 * - 途中経過（回答・経過秒数・和訳を見た段落・調べた単語・読み上げを聞いた段落）は AsyncStorage に保存する。
 *   回答・アシストが変わったとき、経過秒数が 5 秒進むごと、アプリが前面でなくなったとき、画面を離れるときに書く。
 *   消すのは結果画面（提出に失敗しても回答が残るように）と、期限切れになったとき（もう提出できないので）
 * - 読み上げのミニプレーヤーは閉じた設問シートの上に浮かべる（設問シートを開いている間は出さない）。
 *   上部バーの一時停止・期限切れ・提出で読み上げも止める（再開しても読み上げは自動で再開しない）
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

  /**
   * 読み上げるブロック（code 以外）。聞いた段落として戻してよい対象
   */
  const readableBlockIndexes = useMemo(
    () => new Set(attempt.blocks.flatMap((block, index) => (block.type !== "code" ? [index] : []))),
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
  const [submitError, setSubmitError] = useState<string | null>(null)
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
  /**
   * 読み上げを 1 秒以上聞いた段落（提出の listened_block_count）
   */
  const [listenedBlocks, setListenedBlocks] = useState<Set<number>>(() => new Set())
  const readerRef = useRef<FlatList<AttemptBlock>>(null)

  const recordListenedBlock = useCallback((blockIndex: number) => {
    setListenedBlocks(current => (current.has(blockIndex) ? current : new Set(current).add(blockIndex)))
  }, [])

  const readAloud = useReadAloud({ attemptId: attempt.id, blocks: attempt.blocks, onBlockListened: recordListenedBlock })
  const { pause: pauseReadAloud, playBlock: playReadAloudBlock, stop: stopReadAloud } = readAloud
  const autoScroll = useReadingAutoScroll(readerRef, readAloud.playback?.blockIndex ?? null)
  const { resumeFollowing } = autoScroll

  const isRunning = isHydrated && !isPaused && !isExpired && !isSubmitting
  const elapsedSeconds = useActiveSeconds({ initialSeconds: savedSeconds, isRunning })
  const timeLimitSeconds = attempt.time_limit_seconds
  const answeredCount = questions.filter(question => answers[question.id] !== undefined).length
  const closedSheetHeight = calculateClosedSheetHeight(insets.bottom)

  /**
   * 保存に使う最新の途中経過（AppState の変化・画面を離れるときにも書くため ref に持つ）。戻し終えるまでと期限切れの後は null
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
      const saved = await restoreProgress(attempt, { readable: readableBlockIndexes, translatable: translatableBlockIndexes })
      if (!isActive) return
      if (saved) {
        setAnswers(saved.answers)
        setSavedSeconds(saved.elapsedSeconds)
        setListenedBlocks(new Set(saved.listenedBlockIndexes))
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
  }, [attempt, readableBlockIndexes, translatableBlockIndexes])

  useEffect(() => {
    progressRef.current = isHydrated && !isExpired
      ? { answers, elapsedSeconds, listenedBlockIndexes: [...listenedBlocks], translatedBlockIndexes: [...viewedTranslationBlocks], wordLookups }
      : null
  })

  const saveProgress = useCallback(() => {
    if (isSubmittedRef.current || progressRef.current === null) return
    void writeAttemptProgress(attempt.id, progressRef.current)
  }, [attempt.id])

  /**
   * 回答・和訳を見た段落・調べた単語・聞いた段落が変わったとき
   */
  useEffect(() => {
    if (isHydrated) saveProgress()
  }, [answers, isHydrated, listenedBlocks, saveProgress, viewedTranslationBlocks, wordLookups])

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
   * 期限切れになったら（期限の確認・提出の 409）途中経過を消す。もう提出できないので残しても使わない
   * （それ以降は progressRef が null なので、画面を離れるときにも書き戻さない）
   */
  useEffect(() => {
    if (isExpired) void removeAttemptProgress(attempt.id)
  }, [attempt.id, isExpired])

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
      stopReadAloud()
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
  }, [attempt.expires_at, attempt.server_now, stopReadAloud])

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

  const sound = useSoundEffects()
  const { playChoice } = sound
  const isReadAloudPlaying = readAloud.playback?.isPlaying ?? false

  /**
   * 読み上げの再生中は鳴らさない（効果音のために音声のモードを変えると、再生中の読み上げが消音モードで聞こえなくなるおそれがあるため）
   */
  const chooseAnswer = useCallback((questionId: number, choiceIndex: number) => {
    if (answers[questionId] !== choiceIndex && !isReadAloudPlaying) playChoice()
    setAnswers(current => ({ ...current, [questionId]: choiceIndex }))
  }, [answers, isReadAloudPlaying, playChoice])

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
    setWordLookups(current => (current.length >= SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS ? current : [...current, lookup]))
  }, [])

  /**
   * 待機中に再生を始めるときは、読み上げ中の段落を追うスクロールを再開する
   */
  const toggleReadAloud = () => {
    if (readAloud.playback === null) resumeFollowing()
    readAloud.togglePlay()
  }

  /**
   * 本文の行は memo されているので、参照を変えないよう useCallback にする
   */
  const playBlock = useCallback((blockIndex: number) => {
    resumeFollowing()
    playReadAloudBlock(blockIndex)
  }, [playReadAloudBlock, resumeFollowing])

  /**
   * 一時停止で読み上げも止める。再開しても読み上げは自動で再開しない（再生ボタンで再開する）
   */
  const togglePause = () => {
    if (!isPaused) pauseReadAloud()
    setIsPaused(value => !value)
  }

  const openSubmitConfirm = useCallback(() => {
    setSubmitError(null)
    setIsConfirmOpen(true)
  }, [])

  const buildSubmitInput = (): SubmitAttemptRequest => ({
    active_seconds: elapsedSeconds,
    answers: questions.map(question => ({ question_id: question.id, selected_choice_index: answers[question.id] ?? null })),
    listened_block_count: listenedBlocks.size,
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
   * それ以外の失敗は確認のダイアログを閉じずに中へ理由を出す（web と同じ。回答は残り、提出 API は冪等なので再送してよい）。
   * ダイアログを閉じて Alert を出すと、iOS では Modal を閉じている途中の Alert が出ないことがある
   */
  const submit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    stopReadAloud()
    setSubmitError(null)
    try {
      const result = await attemptApi.submit(attempt.id, buildSubmitInput())
      isSubmittedRef.current = true
      setStoreAttempt(result)
      setIsConfirmOpen(false)
      router.replace(`/attempts/${attempt.id}/result`)
    } catch (error) {
      setIsSubmitting(false)
      if (isAxiosError(error) && error.response?.status === 409) {
        setIsConfirmOpen(false)
        setIsExpired(true)
        return
      }
      console.warn("Failed to submit attempt:", error)
      setSubmitError(SUBMIT_FAILED_MESSAGE)
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
    () => [styles.content, { paddingBottom: closedSheetHeight + READ_ALOUD_BAR_SPACE + CONTENT_BOTTOM_SPACE }],
    [closedSheetHeight],
  )

  const readerReadAloud: ReaderReadAloud = {
    activeBlockIndex: readAloud.playback?.blockIndex ?? null,
    isAvailable: readAloud.availability === "ready",
    playingBlockIndex: readAloud.playback?.mode === "block" && readAloud.playback.isPlaying ? readAloud.playback.blockIndex : null,
    reading: readAloud.reading,
    onPlayBlock: playBlock,
  }

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
        isSoundEnabled={sound.isEnabled}
        isTimerPending={!isHydrated}
        remainingSeconds={timeLimitSeconds - elapsedSeconds}
        showAllTranslations={showAllTranslations}
        timeLimitSeconds={timeLimitSeconds}
        onInterrupt={interrupt}
        onToggleAllTranslations={toggleAllTranslations}
        onTogglePause={togglePause}
        onToggleSound={sound.toggle}
      />

      <View style={styles.body}>
        <PassageReader
          ref={readerRef}
          ListFooterComponent={footer}
          blocks={attempt.blocks}
          contentContainerStyle={contentContainerStyle}
          glossary={attempt.glossary}
          peekBlock={peekBlock}
          readAloud={readerReadAloud}
          showAllTranslations={showAllTranslations}
          translatedBlocks={translatedBlocks}
          onLookupDictionary={lookupDictionary}
          onLookupWord={recordWordLookup}
          onPeekEnd={endPeek}
          onPeekStart={startPeek}
          onScrollBeginDrag={autoScroll.onScrollBeginDrag}
          onToggleTranslation={toggleTranslation}
          onWordCard={showWordCard}
        />

        {/**
          * 読み上げのミニプレーヤー。閉じた設問シートの上に浮かべ、設問シートを開いている間は出さない。
          * 単語のカード（zIndex 35）と一時停止の表示（40）より下に重ねる（一時停止中は押せない）
          */}
        {!isSheetOpen && (
          <View style={[styles.readAloudWrapper, { bottom: closedSheetHeight + READ_ALOUD_BAR_GAP }]}>
            {readAloud.playback !== null && !autoScroll.isFollowing && <ReturnToReadingButton onPress={resumeFollowing} />}
            <ReadAloudBar
              availability={readAloud.availability}
              blocks={attempt.blocks}
              playback={readAloud.playback}
              progress={readAloud.progress}
              rate={readAloud.rate}
              onRateCycle={readAloud.cycleRate}
              onStop={stopReadAloud}
              onToggle={toggleReadAloud}
            />
          </View>
        )}

        {wordCard && (
          <View style={[styles.wordCardWrapper, { bottom: closedSheetHeight + READ_ALOUD_BAR_SPACE }]}>
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
        errorMessage={submitError}
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
  readAloudWrapper: {
    left: 12,
    pointerEvents: "box-none",
    position: "absolute",
    right: 12,
    zIndex: 30,
  },
  screen: {
    flex: 1,
  },
  wordCardWrapper: {
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 35,
  },
})
