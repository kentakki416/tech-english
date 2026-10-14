"use client"

import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"

import {
  type InProgressAttempt,
  SUBMIT_ATTEMPT_MAX_WORD_LENGTH,
  SUBMIT_ATTEMPT_MAX_WORD_LOOKUPS,
  type SubmitAttemptRequest,
} from "@repo/api-schema"

import type { SubmitAttemptActionResult } from "@/app/attempts/[id]/actions"
import { PassageReader, type ReaderFontSize, type ReaderReadAloud } from "@/components/features/passage/PassageReader"
import { SourceMeta } from "@/components/features/passage/SourceMeta"
import { useDictionaryLookup } from "@/components/features/passage/use-dictionary-lookup"
import { useReaderFontSize } from "@/components/features/passage/use-reader-font-size"
import { ReadAloudBar, ReturnToReadingButton } from "@/components/features/read-aloud/ReadAloudBar"
import { useReadAloud } from "@/components/features/read-aloud/use-read-aloud"
import { useReadingAutoScroll } from "@/components/features/read-aloud/use-reading-auto-scroll"
import { Keycap } from "@/components/ui/Keycap"
import {
  type AttemptProgress,
  readAttemptProgress,
  removeAttemptProgress,
  type WordLookupRecord,
  writeAttemptProgress,
} from "@/features/attempt/attempt-progress"
import { useActiveSeconds } from "@/libs/use-active-seconds"
import { useIsClient } from "@/libs/use-is-client"

import { AttributionNote } from "./AttributionNote"
import { ExpiredDialog } from "./ExpiredDialog"
import { PauseOverlay } from "./PauseOverlay"
import { QuestionPanel } from "./QuestionPanel"
import { QuestionSheet } from "./QuestionSheet"
import { ShortcutsDialog } from "./ShortcutsDialog"
import { SubmitConfirmDialog } from "./SubmitConfirmDialog"
import { determineTimerPhase, type TimerPhase, TimerReadout } from "./TimerReadout"
import { useAttemptShortcuts } from "./use-attempt-shortcuts"

/**
 * ページが挑戦の ID を bind して渡す提出の Server Action
 */
type SubmitAttemptAction = (input: SubmitAttemptRequest) => Promise<SubmitAttemptActionResult>

type RestoredProgress = Omit<AttemptProgress, "version">

const FONT_SIZE_OPTIONS: { key: ReaderFontSize, label: string, sizeClass: string }[] = [
  { key: "sm", label: "小", sizeClass: "text-[11px]" },
  { key: "md", label: "中", sizeClass: "text-[13px]" },
  { key: "lg", label: "大", sizeClass: "text-[15px]" },
]

/**
 * 期限（開始から 24 時間）を確かめる間隔
 */
const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000

const SUBMIT_FAILED_MESSAGE = "提出できませんでした。時間をおいて再度お試しください。"

const PROGRESS_LINE_CLASS: Record<TimerPhase, string> = {
  normal: "bg-amber/70",
  overtime: "w-full bg-wrong",
  warning: "bg-amber-bright",
}

const HEADER_BUTTON_FOCUS_CLASS = "outline-none focus-visible:ring-2 focus-visible:ring-amber/60"

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
 * （古い保存や壊れた値のせいで提出できなくならないように）。聞いた段落は読み上げより前の保存には無い
 */
const restoreProgress = (
  attempt: InProgressAttempt,
  blockIndexes: { readable: Set<number>, translatable: Set<number> },
): RestoredProgress | null => {
  const saved = readAttemptProgress(attempt.id)
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
 * 問題を解く画面。上部バー・本文・設問パネル（スマホ幅は設問シート）・ステータスバー・ダイアログを並べる。
 *
 * 端末（localStorage）の途中経過は hydration が終わってから読む（サーバーの HTML とのずれを防ぐ）。
 * 読めるようになったら key を変えて作り直し、保存していた回答・経過秒数・アシストの記録を初期値にする（それまでタイマーは動かさない）
 */
export function SolvingScreen({ attempt, submitAction }: { attempt: InProgressAttempt, submitAction: SubmitAttemptAction }) {
  const isHydrated = useIsClient()
  return <SolvingSession key={isHydrated ? "hydrated" : "server"} attempt={attempt} isHydrated={isHydrated} submitAction={submitAction} />
}

function SolvingSession({
  attempt,
  isHydrated,
  submitAction,
}: {
  attempt: InProgressAttempt
  isHydrated: boolean
  submitAction: SubmitAttemptAction
}) {
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

  const [savedProgress] = useState(() => (
    isHydrated ? restoreProgress(attempt, { readable: readableBlockIndexes, translatable: translatableBlockIndexes }) : null
  ))
  const [answers, setAnswers] = useState<Record<number, number>>(savedProgress?.answers ?? {})
  /**
   * 再開したときは最初の未回答の設問から
   */
  const [currentIndex, setCurrentIndex] = useState(() => Math.max(0, questions.findIndex(question => savedProgress?.answers[question.id] === undefined)))
  const [isPaused, setIsPaused] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  /**
   * いま和訳を表示している段落
   */
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(() => new Set())
  /**
   * 和訳を一度でも見た段落（提出の translated_block_count）
   */
  const [viewedTranslationBlocks, setViewedTranslationBlocks] = useState<Set<number>>(() => new Set(savedProgress?.translatedBlockIndexes))
  const [wordLookups, setWordLookups] = useState<WordLookupRecord[]>(savedProgress?.wordLookups ?? [])
  /**
   * 読み上げを 1 秒以上聞いた段落（提出の listened_block_count）
   */
  const [listenedBlocks, setListenedBlocks] = useState<Set<number>>(() => new Set(savedProgress?.listenedBlockIndexes))
  const [isExpired, setIsExpired] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, startSubmitting] = useTransition()
  const [fontSize, setFontSize] = useReaderFontSize()
  const lookupDictionary = useDictionaryLookup()

  const recordListenedBlock = useCallback((blockIndex: number) => {
    setListenedBlocks(current => (current.has(blockIndex) ? current : new Set(current).add(blockIndex)))
  }, [])

  /**
   * hydration の後に作り直す前の描画（key が server）では取得しない（取得を 1 回にする）
   */
  const readAloud = useReadAloud({ attemptId: attempt.id, blocks: attempt.blocks, isEnabled: isHydrated, onBlockListened: recordListenedBlock })
  const { pause: pauseReadAloud, playBlock: playReadAloudBlock, stop: stopReadAloud } = readAloud
  const autoScroll = useReadingAutoScroll(readAloud.playback?.blockIndex ?? null)
  const { resumeFollowing } = autoScroll

  const isRunning = isHydrated && !isPaused && !isExpired && !isSubmitting
  const elapsedSeconds = useActiveSeconds({ initialSeconds: savedProgress?.elapsedSeconds ?? 0, isRunning })
  const timeLimitSeconds = attempt.time_limit_seconds
  const remainingSeconds = timeLimitSeconds - elapsedSeconds
  const timerPhase = determineTimerPhase(remainingSeconds, timeLimitSeconds)
  const isOvertime = timerPhase === "overtime"
  const remainingRatio = timeLimitSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / timeLimitSeconds)) : 0
  const answeredCount = questions.filter(question => answers[question.id] !== undefined).length
  const isModalOpen = isConfirmOpen || isShortcutsOpen || isExpired

  /**
   * 途中経過を端末に保存する（経過秒数が変わる毎秒と、回答・アシストが変わるたび）。画面が非表示になったときにも書く。
   * hydration 前（保存を読む前）に書くと保存を 0 で上書きしてしまうので書かない。
   * 期限切れになったら（期限の確認・提出の 409）もう提出できないので、途中経過を消してそれ以降は書かない
   */
  useEffect(() => {
    if (!isHydrated) return
    if (isExpired) {
      removeAttemptProgress(attempt.id)
      return
    }
    const progress: RestoredProgress = {
      answers,
      elapsedSeconds,
      listenedBlockIndexes: [...listenedBlocks],
      translatedBlockIndexes: [...viewedTranslationBlocks],
      wordLookups,
    }
    writeAttemptProgress(attempt.id, progress)
    const writeOnHide = () => {
      if (document.visibilityState === "hidden") writeAttemptProgress(attempt.id, progress)
    }
    document.addEventListener("visibilitychange", writeOnHide)
    return () => document.removeEventListener("visibilitychange", writeOnHide)
  }, [answers, attempt.id, elapsedSeconds, isExpired, isHydrated, listenedBlocks, viewedTranslationBlocks, wordLookups])

  /**
   * 期限（開始から 24 時間）を 1 分ごとと画面に戻ったときに確かめる。端末の時計のずれは server_now で補正する
   */
  useEffect(() => {
    if (!isHydrated) return
    const serverOffsetMs = Date.parse(attempt.server_now) - Date.now()
    const expiresAtMs = Date.parse(attempt.expires_at)
    const checkExpiry = () => {
      if (Date.now() + serverOffsetMs < expiresAtMs) return
      setIsExpired(true)
      setIsConfirmOpen(false)
      setIsShortcutsOpen(false)
      stopReadAloud()
    }
    const timer = window.setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS)
    document.addEventListener("visibilitychange", checkExpiry)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", checkExpiry)
    }
  }, [attempt.expires_at, attempt.server_now, isHydrated, stopReadAloud])

  const chooseAnswer = useCallback((questionId: number, choiceIndex: number) => {
    setAnswers(current => ({ ...current, [questionId]: choiceIndex }))
  }, [])

  const moveQuestion = useCallback((index: number) => {
    setCurrentIndex(Math.min(Math.max(index, 0), questions.length - 1))
  }, [questions.length])

  const toggleTranslation = useCallback((blockIndex: number) => {
    setTranslatedBlocks((current) => {
      const next = new Set(current)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
    setViewedTranslationBlocks(current => (current.has(blockIndex) ? current : new Set(current).add(blockIndex)))
  }, [])

  const toggleAllTranslations = () => {
    if (!showAllTranslations) setViewedTranslationBlocks(current => new Set([...current, ...translatableBlockIndexes]))
    setShowAllTranslations(!showAllTranslations)
  }

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
   * 本文のブロックは memo されているので、参照を変えないよう useCallback にする
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

  const openSubmitConfirm = () => {
    setSubmitError(null)
    setIsConfirmOpen(true)
  }

  const closeDialogs = () => {
    setIsConfirmOpen(false)
    setIsShortcutsOpen(false)
  }

  const submit = () => {
    if (isSubmitting) return
    setSubmitError(null)
    stopReadAloud()
    const input: SubmitAttemptRequest = {
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
    }
    startSubmitting(async () => {
      let result: SubmitAttemptActionResult
      try {
        result = await submitAction(input)
      } catch (error) {
        /**
         * 成功すると Server Action の redirect が例外として届く。結果画面への遷移は Next.js に任せる
         */
        unstable_rethrow(error)
        setSubmitError(SUBMIT_FAILED_MESSAGE)
        return
      }
      if (result.error === "expired") {
        setIsConfirmOpen(false)
        setIsExpired(true)
        return
      }
      setSubmitError(SUBMIT_FAILED_MESSAGE)
    })
  }

  useAttemptShortcuts({
    isDialogOpen: isConfirmOpen || isShortcutsOpen,
    isEnabled: isRunning,
    isSubmitting,
    onChoose: (choiceIndex) => {
      const question = questions[currentIndex]
      if (question && choiceIndex < question.choices.length) chooseAnswer(question.id, choiceIndex)
    },
    onCloseDialog: closeDialogs,
    onMoveQuestion: delta => moveQuestion(currentIndex + delta),
    onOpenShortcuts: () => setIsShortcutsOpen(true),
    onOpenSubmitConfirm: openSubmitConfirm,
    onToggleAllTranslations: toggleAllTranslations,
    onToggleReadAloud: toggleReadAloud,
  })

  const readerReadAloud: ReaderReadAloud = {
    activeBlockIndex: readAloud.playback?.blockIndex ?? null,
    isAvailable: readAloud.availability === "ready",
    playingBlockIndex: readAloud.playback?.mode === "block" && readAloud.playback.isPlaying ? readAloud.playback.blockIndex : null,
    reading: readAloud.reading,
    onPlayBlock: playBlock,
  }

  const statusLabel = isExpired ? "期限切れ" : isPaused ? "一時停止中" : isOvertime ? "時間超過" : "読解中"

  return (
    <>
      <div className="flex h-dvh flex-col overflow-hidden" inert={isModalOpen}>
        <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas px-3 sm:px-4">
          <Link
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-raised hover:text-fg ${HEADER_BUTTON_FOCUS_CLASS}`}
            href="/passages"
            title="途中経過はこの端末に保存され、24 時間以内なら再開できます"
          >
            <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            中断
          </Link>
          <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
            <span className="truncate font-reading text-[15px] text-fg">{attempt.passage.title}</span>
            <span className="hidden xl:inline-flex">
              <SourceMeta kind={attempt.attribution.source_kind} name={attempt.attribution.source_name} />
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <TimerReadout isPending={!isHydrated} remainingSeconds={remainingSeconds} timeLimitSeconds={timeLimitSeconds} />
            <div aria-label="文字サイズ" className="ml-2 hidden items-center rounded-md border border-line p-0.5 md:flex" role="group">
              {FONT_SIZE_OPTIONS.map(option => (
                <button
                  key={option.key}
                  aria-label={`文字サイズ ${option.label}`}
                  aria-pressed={fontSize === option.key}
                  className={`grid size-7 place-items-center rounded font-reading ${HEADER_BUTTON_FOCUS_CLASS} ${option.sizeClass} ${
                    fontSize === option.key ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
                  }`}
                  onClick={() => setFontSize(option.key)}
                  type="button"
                >
                  A
                </button>
              ))}
            </div>
            <button
              aria-pressed={showAllTranslations}
              className={`h-8 rounded-md border px-2.5 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40 ${HEADER_BUTTON_FOCUS_CLASS} ${
                showAllTranslations ? "border-amber/60 bg-amber-wash text-amber" : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
              }`}
              disabled={isPaused}
              onClick={toggleAllTranslations}
              type="button"
            >
              全文訳
            </button>
            <button
              aria-label={isPaused ? "再開する" : "一時停止"}
              className={`grid size-8 place-items-center rounded-md border text-fg-muted hover:border-line-strong hover:text-fg ${HEADER_BUTTON_FOCUS_CLASS} ${
                isPaused ? "border-line-strong bg-raised" : "border-line"
              }`}
              onClick={togglePause}
              type="button"
            >
              {isPaused ? (
                <svg aria-hidden className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" /></svg>
              ) : (
                <svg aria-hidden className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              )}
            </button>
            <button
              className={`hidden h-8 rounded-md bg-amber px-3.5 text-sm font-semibold text-amber-ink transition-colors hover:bg-amber-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:block ${HEADER_BUTTON_FOCUS_CLASS}`}
              onClick={openSubmitConfirm}
              type="button"
            >
              提出する
            </button>
          </div>
          <div aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-line">
            <div
              className={`h-full transition-[width] duration-1000 ease-linear ${isHydrated ? PROGRESS_LINE_CLASS[timerPhase] : "invisible"}`}
              style={isOvertime ? undefined : { width: `${remainingRatio * 100}%` }}
            />
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_420px]">
          {/**
            * ミニプレーヤーは本文の列の下端に sticky で固定する。止まる位置はスクロール領域の padding の内側なので、
            * スマホ幅は閉じた設問シート（64px）の上、PC は下端から 20px。一時停止中は main が inert なので押せない
            */}
          <main
            className="h-full overflow-y-auto pt-8 pr-5 pb-20 pl-1 sm:px-6 lg:px-10 lg:pb-5"
            inert={isPaused}
            {...autoScroll.scrollHandlers}
          >
            <div className="mx-auto max-w-3xl">
              <PassageReader
                blocks={attempt.blocks}
                fontSize={fontSize}
                glossary={attempt.glossary}
                readAloud={readerReadAloud}
                showAllTranslations={showAllTranslations}
                translatedBlocks={translatedBlocks}
                onLookupDictionary={lookupDictionary}
                onLookupWord={recordWordLookup}
                onToggleTranslation={toggleTranslation}
              />
              <AttributionNote attribution={attempt.attribution} />
            </div>
            <div className="pointer-events-none sticky bottom-0 z-10 mx-auto mt-8 max-w-3xl pl-11 sm:pl-14">
              <div className="pointer-events-auto">
                {readAloud.playback !== null && !autoScroll.isFollowing && <ReturnToReadingButton onClick={resumeFollowing} />}
                <ReadAloudBar
                  isShortcutVisible
                  availability={readAloud.availability}
                  blocks={attempt.blocks}
                  playback={readAloud.playback}
                  progress={readAloud.progress}
                  rate={readAloud.rate}
                  onRateChange={readAloud.setRate}
                  onStop={stopReadAloud}
                  onToggle={toggleReadAloud}
                />
              </div>
            </div>
          </main>

          <aside aria-label="設問" className="hidden h-full border-l border-line bg-surface lg:block" inert={isPaused}>
            <QuestionPanel answers={answers} currentIndex={currentIndex} questions={questions} onChoose={chooseAnswer} onMove={moveQuestion} />
          </aside>

          <QuestionSheet
            answeredCount={answeredCount}
            currentIndex={currentIndex}
            isInert={isPaused}
            isOpen={isSheetOpen}
            questionCount={questions.length}
            onOpenSubmitConfirm={openSubmitConfirm}
            onToggle={() => setIsSheetOpen(value => !value)}
          >
            <QuestionPanel
              answers={answers}
              currentIndex={currentIndex}
              isLabelVisible={false}
              questions={questions}
              onChoose={chooseAnswer}
              onMove={moveQuestion}
            />
          </QuestionSheet>

          {isPaused && <PauseOverlay onResume={() => setIsPaused(false)} />}
        </div>

        <footer className="hidden h-8 shrink-0 items-center gap-4 border-t border-line bg-surface px-3 text-[12px] text-fg-muted lg:flex">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={`size-1.5 rounded-full ${isPaused || isExpired ? "bg-fg-faint" : isOvertime ? "bg-wrong" : "bg-amber"}`} />
            {statusLabel}
          </span>
          <span aria-hidden className="h-3 w-px bg-line-strong" />
          <span className="tabular-nums">{attempt.passage.word_count} 語</span>
          <span aria-hidden className="h-3 w-px bg-line-strong" />
          <span className="tabular-nums">回答 {answeredCount} / {questions.length}</span>
          <span aria-hidden className="h-3 w-px bg-line-strong" />
          <span className="tabular-nums">和訳 {viewedTranslationBlocks.size} 段落</span>
          <span className="tabular-nums">単語 {wordLookups.length} 回</span>
          <span className="tabular-nums">読み上げ {listenedBlocks.size} 段落</span>
          <div className="ml-auto flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Keycap>T</Keycap>全文訳</span>
            <span className="flex items-center gap-1.5"><Keycap>R</Keycap>読み上げ</span>
            <span className="flex items-center gap-1.5"><Keycap>J</Keycap><Keycap>K</Keycap>設問</span>
            <span className="flex items-center gap-1.5"><Keycap>⌘</Keycap><Keycap>↵</Keycap>提出</span>
            <button className="flex items-center gap-1.5 rounded hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60 outline-none" onClick={() => setIsShortcutsOpen(true)} type="button">
              <Keycap>?</Keycap>ショートカット
            </button>
          </div>
        </footer>
      </div>

      {isConfirmOpen && (
        <SubmitConfirmDialog
          errorMessage={submitError}
          isSubmitting={isSubmitting}
          unansweredCount={questions.length - answeredCount}
          onCancel={() => setIsConfirmOpen(false)}
          onSubmit={submit}
        />
      )}
      {isShortcutsOpen && <ShortcutsDialog onClose={() => setIsShortcutsOpen(false)} />}
      {isExpired && <ExpiredDialog passageId={attempt.passage.id} />}
    </>
  )
}
