"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import {
  formatSeconds,
  MOCK_BLOCKS,
  MOCK_DICTIONARY,
  MOCK_GLOSSARY,
  MOCK_HIDDEN_GLOSSARY_IDS,
  MOCK_PASSAGE,
  MOCK_QUESTIONS,
} from "@/libs/mock-data"

import { Keycap, SourceMeta } from "../../_components/parts"
import { PassageReader, type ReaderFontSize } from "../../_components/PassageReader"

export type SolvingMockState = "confirm" | "normal" | "overtime" | "paused" | "warning"

const INITIAL_REMAINING: Record<SolvingMockState, number> = {
  confirm: 96,
  normal: 252,
  overtime: -83,
  paused: 252,
  warning: 48,
}

const CHOICE_LETTERS = ["A", "B", "C", "D"]

const PROSE_BLOCK_INDEXES = MOCK_BLOCKS.flatMap((block, index) => (block.type === "code" ? [] : [index]))

const FONT_SIZE_OPTIONS: { key: ReaderFontSize, label: string, sizeClass: string }[] = [
  { key: "sm", label: "小", sizeClass: "text-[11px]" },
  { key: "md", label: "中", sizeClass: "text-[13px]" },
  { key: "lg", label: "大", sizeClass: "text-[15px]" },
]

const SHORTCUTS: { keys: string[], label: string }[] = [
  { keys: ["1", "2", "3", "4"], label: "選択肢 A〜D を選ぶ" },
  { keys: ["J"], label: "次の設問へ" },
  { keys: ["K"], label: "前の設問へ" },
  { keys: ["T"], label: "全文の和訳を切り替え" },
  { keys: ["Esc"], label: "単語のカードを閉じる" },
  { keys: ["⌘", "Enter"], label: "提出する" },
  { keys: ["?"], label: "この一覧を表示" },
]

function TimerReadout({ remaining }: { remaining: number }) {
  const isOvertime = remaining < 0
  const isWarning = !isOvertime && remaining <= MOCK_PASSAGE.timeLimitSeconds * 0.2
  return (
    <div
      aria-live="off"
      className={`flex items-baseline gap-1.5 tabular-nums ${isOvertime ? "text-wrong" : isWarning ? "text-amber" : "text-fg"}`}
    >
      <span className="text-[11px] text-fg-muted">{isOvertime ? "超過" : "残り"}</span>
      <span className="text-lg font-semibold tracking-tight">
        {isOvertime ? `+${formatSeconds(-remaining)}` : formatSeconds(remaining)}
      </span>
    </div>
  )
}

function QuestionPanel({
  answers,
  currentIndex,
  isLabelVisible = true,
  onChoose,
  onMove,
}: {
  answers: Record<number, number | null>
  currentIndex: number
  isLabelVisible?: boolean
  onChoose: (questionId: number, choiceIndex: number) => void
  onMove: (index: number) => void
}) {
  const question = MOCK_QUESTIONS[currentIndex]
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-4 py-3">
        {isLabelVisible && <span className="mr-2 text-xs text-fg-muted">設問</span>}
        {MOCK_QUESTIONS.map((item, index) => {
          const isAnswered = answers[item.id] !== undefined && answers[item.id] !== null
          return (
            <button
              aria-current={index === currentIndex ? "step" : undefined}
              aria-label={`Q${index + 1}${isAnswered ? "（回答済み）" : ""}`}
              className={`relative grid h-8 w-9 place-items-center rounded-md text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
                index === currentIndex ? "bg-raised text-fg ring-1 ring-line-strong" : "text-fg-muted hover:bg-raised hover:text-fg"
              }`}
              key={item.id}
              onClick={() => onMove(index)}
              type="button"
            >
              {index + 1}
              <span
                aria-hidden
                className={`absolute bottom-1 size-1 rounded-full ${isAnswered ? "bg-amber" : "bg-transparent"}`}
              />
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <p className="text-xs text-fg-muted">Q{currentIndex + 1}</p>
        <h2 className="mt-2 font-reading text-[17px] leading-relaxed text-fg">{question.prompt}</h2>
        <ul className="mt-5 space-y-2.5">
          {question.choices.map((choice, choiceIndex) => {
            const isSelected = answers[question.id] === choiceIndex
            return (
              <li key={choiceIndex}>
                <button
                  aria-pressed={isSelected}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
                    isSelected
                      ? "border-amber/70 bg-amber-wash"
                      : "border-line hover:border-line-strong hover:bg-raised"
                  }`}
                  onClick={() => onChoose(question.id, choiceIndex)}
                  type="button"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-md border font-code text-xs ${
                      isSelected ? "border-amber bg-amber text-amber-ink" : "border-line-strong text-fg-muted"
                    }`}
                  >
                    {CHOICE_LETTERS[choiceIndex]}
                  </span>
                  <span className="pt-px font-reading text-[15.5px] leading-snug text-fg">{choice}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <button
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60 disabled:pointer-events-none disabled:opacity-40"
          onClick={() => onMove(currentIndex - 1)}
          type="button"
        >
          <span className="hidden lg:inline"><Keycap>K</Keycap></span>
          前の設問
        </button>
        <button
          disabled={currentIndex === MOCK_QUESTIONS.length - 1}
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60 disabled:pointer-events-none disabled:opacity-40"
          onClick={() => onMove(currentIndex + 1)}
          type="button"
        >
          次の設問
          <span className="hidden lg:inline"><Keycap>J</Keycap></span>
        </button>
      </div>
    </div>
  )
}

function Dialog({ children, labelledBy }: { children: React.ReactNode, labelledBy: string }) {
  return (
    <div aria-labelledby={labelledBy} aria-modal className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog">
      <div className="w-full max-w-md rounded-xl border border-line-strong bg-raised p-6 shadow-2xl">{children}</div>
    </div>
  )
}

/**
 * 問題を解く画面（モック）
 */
export function SolvingScreen({ initialState }: { initialState: SolvingMockState }) {
  const [answers, setAnswers] = useState<Record<number, number | null>>(
    initialState === "confirm" ? { 1: 1, 2: 2, 3: 1 } : { 1: 1, 2: 2 },
  )
  const [currentIndex, setCurrentIndex] = useState(initialState === "confirm" ? 3 : 2)
  const [remaining, setRemaining] = useState(INITIAL_REMAINING[initialState])
  const [isPaused, setIsPaused] = useState(initialState === "paused")
  const [isConfirmOpen, setIsConfirmOpen] = useState(initialState === "confirm")
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [viewedTranslations, setViewedTranslations] = useState<Set<number>>(new Set([2]))
  const [lookupCount, setLookupCount] = useState(2)
  const [fontSize, setFontSize] = useState<ReaderFontSize>("md")

  const answeredCount = MOCK_QUESTIONS.filter(question => answers[question.id] !== undefined && answers[question.id] !== null).length
  const unansweredCount = MOCK_QUESTIONS.length - answeredCount
  const isOvertime = remaining < 0
  const progress = Math.max(0, Math.min(1, remaining / MOCK_PASSAGE.timeLimitSeconds))
  const isWarning = !isOvertime && progress <= 0.2

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isPaused && document.visibilityState === "visible") setRemaining(value => value - 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isPaused])

  const toggleAllTranslations = useCallback(() => {
    setShowAllTranslations((value) => {
      if (!value) setViewedTranslations(new Set(PROSE_BLOCK_INDEXES))
      return !value
    })
  }, [])

  const chooseAnswer = useCallback((questionId: number, choiceIndex: number) => {
    setAnswers(value => ({ ...value, [questionId]: choiceIndex }))
  }, [])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if (isPaused) return
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        setIsConfirmOpen(true)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (["1", "2", "3", "4"].includes(event.key)) chooseAnswer(MOCK_QUESTIONS[currentIndex].id, Number(event.key) - 1)
      if (event.key === "j") setCurrentIndex(value => Math.min(value + 1, MOCK_QUESTIONS.length - 1))
      if (event.key === "k") setCurrentIndex(value => Math.max(value - 1, 0))
      if (event.key === "t") toggleAllTranslations()
      if (event.key === "?") setIsShortcutsOpen(value => !value)
      if (event.key === "Escape") {
        setIsShortcutsOpen(false)
        setIsConfirmOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  }, [chooseAnswer, currentIndex, isPaused, toggleAllTranslations])

  const toggleTranslation = (blockIndex: number) => {
    setTranslatedBlocks((value) => {
      const next = new Set(value)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
    setViewedTranslations(value => new Set(value).add(blockIndex))
  }

  const statusLabel = isPaused ? "一時停止中" : isOvertime ? "時間超過" : "読解中"

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas px-3 sm:px-4">
        <Link
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
          href="/mock/passages"
        >
          <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          中断
        </Link>
        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <span className="truncate font-reading text-[15px] text-fg">{MOCK_PASSAGE.title}</span>
          <span className="hidden xl:inline-flex"><SourceMeta kind={MOCK_PASSAGE.kind} name={MOCK_PASSAGE.sourceName} /></span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <TimerReadout remaining={remaining} />
          <div aria-label="文字サイズ" className="ml-2 hidden items-center rounded-md border border-line p-0.5 md:flex" role="group">
            {FONT_SIZE_OPTIONS.map(option => (
              <button
                aria-label={`文字サイズ ${option.label}`}
                aria-pressed={fontSize === option.key}
                className={`grid h-7 w-7 place-items-center rounded font-reading outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${option.sizeClass} ${
                  fontSize === option.key ? "bg-raised text-fg" : "text-fg-muted hover:text-fg"
                }`}
                key={option.key}
                onClick={() => setFontSize(option.key)}
                type="button"
              >
                A
              </button>
            ))}
          </div>
          <button
            aria-pressed={showAllTranslations}
            className={`h-8 rounded-md border px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber/60 ${
              showAllTranslations ? "border-amber/60 bg-amber-wash text-amber" : "border-line text-fg-muted hover:border-line-strong hover:text-fg"
            }`}
            onClick={toggleAllTranslations}
            type="button"
          >
            全文訳
          </button>
          <button
            aria-label={isPaused ? "再開する" : "一時停止"}
            className="grid size-8 place-items-center rounded-md border border-line text-fg-muted outline-none hover:border-line-strong hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
            onClick={() => setIsPaused(value => !value)}
            type="button"
          >
            {isPaused ? (
              <svg aria-hidden className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" /></svg>
            ) : (
              <svg aria-hidden className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            )}
          </button>
          <button
            className="hidden h-8 rounded-md bg-amber px-3.5 text-sm font-semibold text-amber-ink outline-none transition-colors hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:block"
            onClick={() => setIsConfirmOpen(true)}
            type="button"
          >
            提出する
          </button>
        </div>
        <div aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-line">
          <div
            className={`h-full transition-[width] duration-1000 ease-linear ${isOvertime ? "w-full bg-wrong" : isWarning ? "bg-amber-bright" : "bg-amber/70"}`}
            style={isOvertime ? undefined : { width: `${progress * 100}%` }}
          />
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_420px]">
        <main className="h-full overflow-y-auto pt-8 pr-5 pb-28 pl-1 sm:px-6 lg:px-10 lg:pb-16">
          <div className="mx-auto max-w-3xl">
            <PassageReader
              blocks={MOCK_BLOCKS}
              dictionary={MOCK_DICTIONARY}
              fontSize={fontSize}
              glossary={MOCK_GLOSSARY}
              hiddenGlossaryIds={MOCK_HIDDEN_GLOSSARY_IDS}
              showAllTranslations={showAllTranslations}
              translatedBlocks={translatedBlocks}
              onLookup={() => setLookupCount(value => value + 1)}
              onToggleTranslation={toggleTranslation}
            />
            <p className="mt-10 border-t border-line pt-4 pl-11 text-xs leading-relaxed text-fg-faint sm:pl-14">
              出典：{MOCK_PASSAGE.sourceName}（{MOCK_PASSAGE.license}）。一部を抜粋・改変しています。
            </p>
          </div>
        </main>

        <aside aria-label="設問" className="hidden h-full border-l border-line bg-surface lg:block">
          <QuestionPanel answers={answers} currentIndex={currentIndex} onChoose={chooseAnswer} onMove={setCurrentIndex} />
        </aside>

        <div
          className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgb(0_0_0/0.4)] transition-[height] duration-300 lg:hidden ${
            isSheetOpen ? "h-[78dvh]" : "h-16"
          }`}
        >
          <button
            aria-expanded={isSheetOpen}
            className="flex h-16 w-full shrink-0 items-center gap-3 px-4 text-left outline-none"
            onClick={() => setIsSheetOpen(value => !value)}
            type="button"
          >
            <span className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong" />
            <span className="text-sm font-semibold text-fg">設問</span>
            <span className="text-sm text-fg-muted tabular-nums">回答 {answeredCount} / {MOCK_QUESTIONS.length}</span>
            <span className="ml-auto text-sm text-fg-muted">{isSheetOpen ? "本文に戻る" : `Q${currentIndex + 1} を開く`}</span>
          </button>
          {isSheetOpen && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <QuestionPanel answers={answers} currentIndex={currentIndex} isLabelVisible={false} onChoose={chooseAnswer} onMove={setCurrentIndex} />
              </div>
              <div className="border-t border-line p-3">
                <button
                  className="h-11 w-full rounded-lg bg-amber text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60"
                  onClick={() => setIsConfirmOpen(true)}
                  type="button"
                >
                  提出する
                </button>
              </div>
            </div>
          )}
        </div>

        {isPaused && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-canvas px-6">
            <div className="max-w-sm text-center">
              <span aria-hidden className="mx-auto block size-4 rounded-[4px] border border-line-strong bg-heat-0" />
              <h2 className="mt-5 text-lg font-semibold text-fg">一時停止中</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                本文と設問を隠しています。再開するとタイマーが動きます。
              </p>
              <button
                className="mt-6 h-10 rounded-lg bg-amber px-5 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60"
                onClick={() => setIsPaused(false)}
                type="button"
              >
                再開する
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="hidden h-8 shrink-0 items-center gap-4 border-t border-line bg-surface px-3 text-[12px] text-fg-muted lg:flex">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`size-1.5 rounded-full ${isPaused ? "bg-fg-faint" : isOvertime ? "bg-wrong" : "bg-amber"}`} />
          {statusLabel}
        </span>
        <span className="h-3 w-px bg-line-strong" />
        <span className="tabular-nums">{MOCK_PASSAGE.wordCount} 語</span>
        <span className="h-3 w-px bg-line-strong" />
        <span className="tabular-nums">回答 {answeredCount} / {MOCK_QUESTIONS.length}</span>
        <span className="h-3 w-px bg-line-strong" />
        <span className="tabular-nums">和訳 {viewedTranslations.size} 段落</span>
        <span className="tabular-nums">単語 {lookupCount} 回</span>
        <div className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1.5"><Keycap>T</Keycap>全文訳</span>
          <span className="flex items-center gap-1.5"><Keycap>J</Keycap><Keycap>K</Keycap>設問</span>
          <span className="flex items-center gap-1.5"><Keycap>⌘</Keycap><Keycap>↵</Keycap>提出</span>
          <button className="flex items-center gap-1.5 hover:text-fg" onClick={() => setIsShortcutsOpen(true)} type="button">
            <Keycap>?</Keycap>ショートカット
          </button>
        </div>
      </footer>

      {isConfirmOpen && (
        <Dialog labelledBy="confirm-title">
          <h2 className="text-lg font-semibold text-fg" id="confirm-title">
            {unansweredCount > 0 ? `未回答の設問が ${unansweredCount} 問あります` : "回答を提出しますか？"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {unansweredCount > 0 ? "未回答の設問は不正解として採点されます。" : ""}提出すると回答は変更できません。
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              className="h-10 rounded-lg border border-line-strong px-4 text-sm text-fg outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-amber/60"
              onClick={() => setIsConfirmOpen(false)}
              type="button"
            >
              {unansweredCount > 0 ? "戻って回答する" : "戻る"}
            </button>
            <Link
              className="grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60"
              href={`/mock/attempts/${MOCK_PASSAGE.id}/result`}
            >
              提出する
            </Link>
          </div>
        </Dialog>
      )}

      {isShortcutsOpen && (
        <Dialog labelledBy="shortcuts-title">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-fg" id="shortcuts-title">キーボードショートカット</h2>
            <button className="text-sm text-fg-muted hover:text-fg" onClick={() => setIsShortcutsOpen(false)} type="button">閉じる</button>
          </div>
          <dl className="mt-4 divide-y divide-line">
            {SHORTCUTS.map(shortcut => (
              <div className="flex items-center justify-between py-2.5" key={shortcut.label}>
                <dt className="text-sm text-fg">{shortcut.label}</dt>
                <dd className="flex gap-1">{shortcut.keys.map(key => <Keycap key={key}>{key}</Keycap>)}</dd>
              </div>
            ))}
          </dl>
        </Dialog>
      )}
    </div>
  )
}
