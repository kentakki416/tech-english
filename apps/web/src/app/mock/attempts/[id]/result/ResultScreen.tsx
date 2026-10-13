"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import {
  formatSeconds,
  MOCK_BLOCKS,
  MOCK_DICTIONARY,
  MOCK_GLOSSARY,
  MOCK_PASSAGE,
  MOCK_QUESTIONS,
  MOCK_RESULT,
  MOCK_SUBMITTED_ANSWERS,
  QUESTION_TYPE_LABELS,
} from "@/libs/mock-data"

import { ScoreSquares, SourceMeta } from "../../../_components/parts"
import { PassageReader } from "../../../_components/PassageReader"
import { ReadAloudBar, ReturnToReadingButton, useReadAloudMock } from "../../../_components/ReadAloud"

/**
 * 解答中に読み上げを聞いた段落の数（モック用の値）
 */
const MOCK_LISTENED_BLOCK_COUNT = 2

const CHOICE_LETTERS = ["A", "B", "C", "D"]

function ChoiceRow({
  choice,
  index,
  isCorrectChoice,
  isUserChoice,
}: {
  choice: string
  index: number
  isCorrectChoice: boolean
  isUserChoice: boolean
}) {
  const tone = isCorrectChoice
    ? "border-correct/50 bg-correct-wash"
    : isUserChoice
      ? "border-wrong/50 bg-wrong-wash"
      : "border-transparent"
  return (
    <li className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${tone}`}>
      <span
        className={`grid size-5 shrink-0 place-items-center rounded font-code text-[11px] ${
          isCorrectChoice ? "bg-correct text-canvas" : isUserChoice ? "bg-wrong text-canvas" : "border border-line-strong text-fg-faint"
        }`}
      >
        {CHOICE_LETTERS[index]}
      </span>
      <span className={`flex-1 font-reading text-[15px] leading-snug ${isCorrectChoice || isUserChoice ? "text-fg" : "text-fg-muted"}`}>{choice}</span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-[11px]">
        {isCorrectChoice && <span className="text-correct">正解</span>}
        {isUserChoice && <span className={isCorrectChoice ? "text-correct" : "text-wrong"}>あなたの回答</span>}
      </span>
    </li>
  )
}

/**
 * 結果・解説画面（モック）
 */
export function ResultScreen({ elapsedSeconds }: { elapsedSeconds: number }) {
  const results = MOCK_QUESTIONS.map(question => MOCK_SUBMITTED_ANSWERS[question.id] === question.correctChoiceIndex)
  const correctCount = results.filter(Boolean).length
  const firstWrong = MOCK_QUESTIONS.find(question => MOCK_SUBMITTED_ANSWERS[question.id] !== question.correctChoiceIndex)

  const [highlightQuestionId, setHighlightQuestionId] = useState<number | null>(firstWrong?.id ?? null)
  const [openQuestionIds, setOpenQuestionIds] = useState<Set<number>>(
    new Set(MOCK_QUESTIONS.filter(question => MOCK_SUBMITTED_ANSWERS[question.id] !== question.correctChoiceIndex).map(question => question.id)),
  )
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [isFollowing, setIsFollowing] = useState(true)
  const readAloud = useReadAloudMock({ blocks: MOCK_BLOCKS, glossary: MOCK_GLOSSARY })
  const readingBlockIndex = readAloud.state.blockIndex
  const isReading = readingBlockIndex !== null

  useEffect(() => {
    if (readingBlockIndex === null || !isFollowing) return
    document.getElementById(`block-${readingBlockIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [isFollowing, readingBlockIndex])

  const stopFollowing = () => {
    if (isReading && isFollowing) setIsFollowing(false)
  }

  const highlight = MOCK_QUESTIONS.find(question => question.id === highlightQuestionId)?.evidence ?? null
  const isOvertime = elapsedSeconds > MOCK_PASSAGE.timeLimitSeconds
  const wpm = Math.round(MOCK_PASSAGE.wordCount / (elapsedSeconds / 60))
  const timeRatio = Math.min(elapsedSeconds / MOCK_PASSAGE.timeLimitSeconds, 1.25)

  const showEvidence = (questionId: number, blockIndex: number) => {
    setHighlightQuestionId(questionId)
    window.requestAnimationFrame(() => {
      document.getElementById(`block-${blockIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }

  const toggleQuestion = (questionId: number) => {
    setOpenQuestionIds((value) => {
      const next = new Set(value)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const toggleTranslation = (blockIndex: number) => {
    setTranslatedBlocks((value) => {
      const next = new Set(value)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/95 px-3 backdrop-blur sm:px-4">
        <Link
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-amber/60"
          href="/mock/passages"
        >
          <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          問題一覧
        </Link>
        <span className="hidden truncate font-reading text-[15px] text-fg md:block">{MOCK_PASSAGE.title}</span>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Link className="h-8 rounded-md px-3 text-sm leading-8 text-fg-muted hover:bg-raised hover:text-fg" href="/mock/home">
            マイページへ
          </Link>
          <Link className="h-8 rounded-md border border-line-strong px-3 text-sm leading-8 text-fg hover:bg-raised" href="/mock/attempts/42">
            もう一度解く
          </Link>
          <Link className="h-8 rounded-md bg-amber px-3.5 text-sm leading-8 font-semibold text-amber-ink hover:bg-amber-bright" href="/mock/passages/57">
            次の問題を解く
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col-reverse lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_480px]">
        <main
          className="border-t border-line pt-8 pr-5 pb-5 pl-1 sm:px-6 lg:overflow-y-auto lg:border-t-0 lg:px-10"
          onTouchMove={stopFollowing}
          onWheel={stopFollowing}
        >
          <div className="mx-auto max-w-3xl">
            <p className="mb-6 pl-11 text-xs text-fg-muted sm:pl-14">
              本文（根拠の箇所をハイライトしています。単語のタップ・和訳・読み上げはここでも使えます）
            </p>
            <PassageReader
              blocks={MOCK_BLOCKS}
              dictionary={MOCK_DICTIONARY}
              glossary={MOCK_GLOSSARY}
              highlight={highlight}
              readAloud={readAloud.state}
              translatedBlocks={translatedBlocks}
              onPlayBlock={(blockIndex) => {
                setIsFollowing(true)
                readAloud.playBlock(blockIndex)
              }}
              onToggleTranslation={toggleTranslation}
            />
          </div>
          <div className="pointer-events-none sticky bottom-3 z-10 mx-auto mt-8 max-w-3xl pl-11 sm:pl-14 lg:bottom-0">
            <div className="pointer-events-auto">
              {isReading && !isFollowing && <ReturnToReadingButton onClick={() => setIsFollowing(true)} />}
              <ReadAloudBar
                blocks={MOCK_BLOCKS}
                isAvailable
                isShortcutVisible={false}
                progress={readAloud.progress}
                rate={readAloud.rate}
                state={readAloud.state}
                onRateChange={readAloud.setRate}
                onStop={readAloud.stop}
                onToggle={() => {
                  if (!isReading) setIsFollowing(true)
                  readAloud.togglePlay()
                }}
              />
            </div>
          </div>
        </main>

        <aside aria-label="結果と解説" className="bg-surface lg:overflow-y-auto lg:border-l lg:border-line">
          <section className="border-b border-line px-5 pt-7 pb-6 sm:px-6">
            <ScoreSquares animate results={results} size="lg" />
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-[34px] leading-none font-semibold tracking-tight text-fg tabular-nums">
                {correctCount} / {results.length}
              </span>
              <span className="text-sm text-fg-muted">問正解</span>
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-fg-muted">かかった時間</dt>
                <dd className="mt-1 flex items-baseline gap-2 tabular-nums">
                  <span className="text-lg font-semibold text-fg">{formatSeconds(elapsedSeconds)}</span>
                  <span className="text-fg-muted">／ 制限 {formatSeconds(MOCK_PASSAGE.timeLimitSeconds)}</span>
                  {isOvertime && (
                    <span className="rounded border border-wrong/50 px-1.5 text-xs text-wrong">
                      {formatSeconds(elapsedSeconds - MOCK_PASSAGE.timeLimitSeconds)} 超過
                    </span>
                  )}
                </dd>
                <div aria-hidden className="relative mt-2 h-1.5 rounded-full bg-heat-0">
                  <div
                    className={`h-full rounded-full ${isOvertime ? "bg-wrong" : "bg-amber"}`}
                    style={{ width: `${(timeRatio / 1.25) * 100}%` }}
                  />
                  <span className="absolute -top-1 h-3.5 w-px bg-fg-muted" style={{ left: `${(1 / 1.25) * 100}%` }} />
                </div>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">読む速さ</dt>
                <dd className="mt-1 text-fg tabular-nums">
                  <span className="text-lg font-semibold">{wpm}</span> WPM
                  <p className="text-xs text-fg-faint">設問を解く時間を含む</p>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">アシストの使用</dt>
                <dd className="mt-1 text-fg tabular-nums">
                  和訳 {MOCK_RESULT.translatedBlockCount} 段落
                  <p className="text-fg">単語 {MOCK_RESULT.wordLookups.length} 回</p>
                  <p className="text-fg">読み上げ {MOCK_LISTENED_BLOCK_COUNT} 段落</p>
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="設問ごとの結果" className="divide-y divide-line border-b border-line">
            {MOCK_QUESTIONS.map((question, index) => {
              const userChoice = MOCK_SUBMITTED_ANSWERS[question.id]
              const isCorrect = userChoice === question.correctChoiceIndex
              const isOpen = openQuestionIds.has(question.id)
              return (
                <article key={question.id} className="px-5 py-4 sm:px-6">
                  <button
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
                    onClick={() => toggleQuestion(question.id)}
                    type="button"
                  >
                    <span className={`size-2.5 shrink-0 rounded-[2px] ${isCorrect ? "bg-correct" : "border border-wrong bg-wrong-wash"}`} />
                    <span className="text-sm font-semibold text-fg">Q{index + 1}</span>
                    <span className="rounded border border-line-strong px-1.5 text-[11px] text-fg-muted">{QUESTION_TYPE_LABELS[question.type]}</span>
                    <span className={`text-sm ${isCorrect ? "text-correct" : "text-wrong"}`}>{isCorrect ? "正解" : "不正解"}</span>
                    <span aria-hidden className={`ml-auto text-fg-faint transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="mt-3">
                      <p className="font-reading text-[16px] leading-relaxed text-fg">{question.prompt}</p>
                      <ul className="mt-3 space-y-1.5">
                        {question.choices.map((choice, choiceIndex) => (
                          <ChoiceRow
                            key={choiceIndex}
                            choice={choice}
                            index={choiceIndex}
                            isCorrectChoice={choiceIndex === question.correctChoiceIndex}
                            isUserChoice={choiceIndex === userChoice}
                          />
                        ))}
                      </ul>
                      <p className="mt-4 text-[14px] leading-[1.85] text-fg">{question.explanationJa}</p>
                      <button
                        className={`mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${
                          highlightQuestionId === question.id
                            ? "border-amber/60 bg-amber-wash text-amber"
                            : "border-line-strong text-fg-muted hover:text-fg"
                        }`}
                        onClick={() => showEvidence(question.id, question.evidence.blockIndex)}
                        type="button"
                      >
                        <span aria-hidden className="size-1.5 rounded-full bg-current" />
                        {highlightQuestionId === question.id ? "本文で根拠を表示中" : "本文の根拠を見る"}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </section>

          <section className="border-b border-line px-5 py-5 sm:px-6">
            <h2 className="text-sm font-semibold text-fg">調べた単語</h2>
            <ul className="mt-3 divide-y divide-line">
              {MOCK_RESULT.wordLookups.map(lookup => (
                <li key={lookup.surface} className="flex items-baseline gap-3 py-2.5">
                  <span className="w-28 shrink-0 font-reading text-[15px] text-fg">{lookup.surface}</span>
                  <span className="flex-1 text-[13px] leading-relaxed text-fg-muted">{lookup.meaningJa}</span>
                  <span className={`shrink-0 text-[11px] ${lookup.source === "glossary" ? "text-amber" : "text-fg-faint"}`}>
                    {lookup.source === "glossary" ? "文脈" : "辞書"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="px-5 py-5 text-xs leading-relaxed text-fg-muted sm:px-6">
            <h2 className="text-sm font-semibold text-fg">出典</h2>
            <div className="mt-2"><SourceMeta kind={MOCK_PASSAGE.kind} name={MOCK_PASSAGE.sourceName} /></div>
            <dl className="mt-3 space-y-1.5">
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-fg-faint">ページ</dt>
                <dd className="min-w-0 truncate"><a className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-amber" href={MOCK_PASSAGE.sourceUrl}>{MOCK_PASSAGE.sourceUrl.replace("https://", "")}</a></dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-fg-faint">取得時点</dt>
                <dd className="min-w-0 truncate"><a className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-amber" href={MOCK_PASSAGE.permalink}>コミット 3f9c2a1</a></dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-fg-faint">ライセンス</dt>
                <dd>{MOCK_PASSAGE.license}</dd>
              </div>
            </dl>
            <p className="mt-3 text-fg-faint">一部を抜粋・改変しています。</p>
          </section>

          <div className="sticky bottom-0 flex gap-2 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
            <Link className="grid h-11 flex-1 place-items-center rounded-lg border border-line-strong text-sm text-fg" href="/mock/attempts/42">
              もう一度解く
            </Link>
            <Link className="grid h-11 flex-1 place-items-center rounded-lg bg-amber text-sm font-semibold text-amber-ink" href="/mock/passages/57">
              次の問題を解く
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
