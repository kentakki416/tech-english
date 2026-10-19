"use client"

import Link from "next/link"
import { useCallback, useState } from "react"

import type { PassageAttributionResponse, ResultQuestion, SubmittedAttempt } from "@repo/api-schema"

import { QUESTION_TYPE_LABELS } from "@/components/features/passage/labels"
import { PassageReader, type ReaderHighlight, type ReaderReadAloud } from "@/components/features/passage/PassageReader"
import { SourceMeta } from "@/components/features/passage/SourceMeta"
import { useDictionaryLookup } from "@/components/features/passage/use-dictionary-lookup"
import { useReaderFontSize } from "@/components/features/passage/use-reader-font-size"
import { ReadAloudBar, ReturnToReadingButton } from "@/components/features/read-aloud/ReadAloudBar"
import { useReadAloud } from "@/components/features/read-aloud/use-read-aloud"
import { useReadingAutoScroll } from "@/components/features/read-aloud/use-reading-auto-scroll"
import { ScoreSquares } from "@/components/ui/ScoreSquares"
import { formatSeconds } from "@/libs/format"

import { QuestionTranslationToggle } from "./QuestionTranslationToggle"

const CHOICE_LETTERS = ["A", "B", "C", "D"]

/**
 * 時間のバーの全幅は制限時間の 1.25 倍
 */
const TIME_BAR_MAX_RATIO = 1.25

/**
 * 取得元のコミットの短い SHA（GitHub の表示に合わせて 7 文字）
 */
const SHORT_SHA_LENGTH = 7

const LINK_CLASS = "text-fg underline decoration-line-strong underline-offset-2 outline-none hover:decoration-amber focus-visible:ring-2 focus-visible:ring-amber/60"

const HEADER_LINK_FOCUS_CLASS = "outline-none focus-visible:ring-2 focus-visible:ring-amber/60"

/**
 * 提出後に正解が直された設問の注記
 */
const ANSWER_KEY_CHANGED_NOTE = "提出後にこの設問の正解が修正されました（正誤は提出したときの採点のままです）"

function ChoiceRow({
  choice,
  index,
  isCorrectChoice,
  isUserChoice,
  translation,
}: {
  choice: string
  index: number
  isCorrectChoice: boolean
  isUserChoice: boolean
  /**
   * 設問の和訳を出しているときの選択肢の和訳（出していないときは null）
   */
  translation: string | null
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
      <span className="flex flex-1 flex-col">
        <span className={`font-reading text-[15px] leading-snug ${isCorrectChoice || isUserChoice ? "text-fg" : "text-fg-muted"}`}>{choice}</span>
        {translation !== null && <span className="mt-1 font-ui text-[13px] leading-snug text-fg-muted">{translation}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-[11px]">
        {isCorrectChoice && <span className="text-correct">正解</span>}
        {isUserChoice && <span className={isCorrectChoice ? "text-correct" : "text-wrong"}>あなたの回答</span>}
      </span>
    </li>
  )
}

/**
 * 出典のリンク。結果画面を離れないよう別のタブで開く
 */
function ExternalLink({ children, href }: { children: React.ReactNode, href: string }) {
  return (
    <a className={LINK_CLASS} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  )
}

/**
 * 出典（content-collection README「出典表示」）。取得時点は GitHub ならコミットへの固定リンク、サイトなら取得日
 */
function AttributionSection({ attribution }: { attribution: PassageAttributionResponse }) {
  const { commit_sha: commitSha, permalink_url: permalinkUrl } = attribution
  return (
    <section className="px-5 py-5 text-xs leading-relaxed text-fg-muted sm:px-6">
      <h2 className="text-sm font-semibold text-fg">出典</h2>
      <div className="mt-2">
        <SourceMeta kind={attribution.source_kind} name={attribution.source_name} />
      </div>
      <dl className="mt-3 space-y-1.5">
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-fg-faint">ページ</dt>
          <dd className="min-w-0 truncate">
            <ExternalLink href={attribution.page_url}>{attribution.page_url.replace(/^https?:\/\//, "")}</ExternalLink>
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-fg-faint">取得時点</dt>
          <dd className="min-w-0 truncate">
            {commitSha !== null && permalinkUrl !== null ? (
              <ExternalLink href={permalinkUrl}>
                コミット <span className="font-code">{commitSha.slice(0, SHORT_SHA_LENGTH)}</span>
              </ExternalLink>
            ) : (
              /**
               * サーバー描画とずれないよう、日付は ISO 文字列の先頭をそのまま出す
               */
              `${attribution.retrieved_at.slice(0, 10)} 時点の内容`
            )}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-20 shrink-0 text-fg-faint">ライセンス</dt>
          <dd className="min-w-0 truncate">
            <ExternalLink href={attribution.license_url}>{attribution.license_spdx}</ExternalLink>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-fg-faint">一部を抜粋・改変しています。</p>
    </section>
  )
}

/**
 * 結果・解説画面。PC 幅は左に本文・右に結果と解説の 2 カラムで、それぞれの列が独立してスクロールする。
 * スマホ幅は 上部バー → スコアと時間 → 設問ごとの結果 → 調べた単語 → 出典 → 本文 の順に縦に並べ、操作を下端に固定する
 */
export function ResultScreen({ result }: { result: SubmittedAttempt }) {
  const { questions } = result
  const results = questions.map(question => question.is_correct)
  const firstWrong = questions.find(question => !question.is_correct && question.evidence !== null)

  /**
   * 最初は最初の不正解の設問の根拠をハイライトする（スクロールはしない。画面の上から読み始めるため）
   */
  const [highlightQuestionId, setHighlightQuestionId] = useState<number | null>(firstWrong?.id ?? null)
  /**
   * 不正解の設問は最初から開き、正解の設問は閉じておく
   */
  const [openQuestionIds, setOpenQuestionIds] = useState<Set<number>>(
    () => new Set(questions.filter(question => !question.is_correct).map(question => question.id)),
  )
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(() => new Set())
  /**
   * 和訳を出している設問（結果画面では記録しない）
   */
  const [translatedQuestionIds, setTranslatedQuestionIds] = useState<Set<number>>(() => new Set())
  /**
   * 文字サイズは解答画面で選んだもの（端末に保存したもの）を使う。結果画面では変えない
   */
  const [fontSize] = useReaderFontSize()
  const lookupDictionary = useDictionaryLookup()
  /**
   * 結果画面で聞いた段落は数えない（onBlockListened を渡さない）。開いただけでは再生しない
   */
  const readAloud = useReadAloud({ attemptId: result.id, blocks: result.blocks })
  const { playBlock: playReadAloudBlock } = readAloud
  const autoScroll = useReadingAutoScroll(readAloud.playback?.blockIndex ?? null)
  const { resumeFollowing } = autoScroll

  const highlightEvidence = questions.find(question => question.id === highlightQuestionId)?.evidence ?? null
  const highlight: ReaderHighlight | null = highlightEvidence
    ? { blockIndex: highlightEvidence.block_index, segmentEnd: highlightEvidence.segment_end, segmentStart: highlightEvidence.segment_start }
    : null

  const elapsedSeconds = result.elapsed_seconds
  const timeLimitSeconds = result.time_limit_seconds
  const timeRatio = timeLimitSeconds > 0 ? Math.min(elapsedSeconds / timeLimitSeconds, TIME_BAR_MAX_RATIO) : TIME_BAR_MAX_RATIO
  const retryHref = `/passages/${result.passage.id}`

  /**
   * PC 幅では本文の列の中で、スマホ幅ではページ全体で、根拠の段落を中央に合わせる（どちらも同じ呼び出しでよい）
   */
  const showEvidence = (question: ResultQuestion) => {
    if (!question.evidence) return
    setHighlightQuestionId(question.id)
    const blockIndex = question.evidence.block_index
    window.requestAnimationFrame(() => {
      document.getElementById(`block-${blockIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }

  const toggleQuestion = (questionId: number) => {
    setOpenQuestionIds((current) => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  const toggleQuestionTranslation = (questionId: number) => {
    setTranslatedQuestionIds((current) => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }

  /**
   * 本文のブロックは memo されているので、参照を変えないよう useCallback にする
   */
  const toggleTranslation = useCallback((blockIndex: number) => {
    setTranslatedBlocks((current) => {
      const next = new Set(current)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
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

  const readerReadAloud: ReaderReadAloud = {
    activeBlockIndex: readAloud.playback?.blockIndex ?? null,
    isAvailable: readAloud.availability === "ready",
    playingBlockIndex: readAloud.playback?.mode === "block" && readAloud.playback.isPlaying ? readAloud.playback.blockIndex : null,
    reading: readAloud.reading,
    onPlayBlock: playBlock,
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/95 px-3 backdrop-blur sm:px-4">
        <Link
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-raised hover:text-fg ${HEADER_LINK_FOCUS_CLASS}`}
          href="/passages"
        >
          <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          問題一覧
        </Link>
        <span className="hidden truncate font-reading text-[15px] text-fg md:block">{result.passage.title}</span>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Link className={`h-8 rounded-md px-3 text-sm leading-8 text-fg-muted hover:bg-raised hover:text-fg ${HEADER_LINK_FOCUS_CLASS}`} href="/">
            マイページへ
          </Link>
          <Link className={`h-8 rounded-md border border-line-strong px-3 text-sm leading-8 text-fg hover:bg-raised ${HEADER_LINK_FOCUS_CLASS}`} href={retryHref}>
            もう一度解く
          </Link>
          <Link
            className={`h-8 rounded-md bg-amber px-3.5 text-sm leading-8 font-semibold text-amber-ink hover:bg-amber-bright focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${HEADER_LINK_FOCUS_CLASS}`}
            href="/passages/random"
          >
            次の問題を解く
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col-reverse lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_480px]">
        {/**
          * スマホ幅はページ全体がスクロールするが、本文の上でのホイール・タッチで自動スクロールが止まれば足りる
          */}
        <main
          className="border-t border-line pt-8 pr-5 pb-5 pl-1 sm:px-6 lg:overflow-y-auto lg:border-t-0 lg:px-10"
          {...autoScroll.scrollHandlers}
        >
          <div className="mx-auto max-w-3xl">
            <p className="mb-6 pl-11 text-xs text-fg-muted sm:pl-14">
              本文（根拠の箇所をハイライトしています。単語のタップ・和訳・読み上げはここでも使えます）
            </p>
            <PassageReader
              blocks={result.blocks}
              fontSize={fontSize}
              glossary={result.glossary}
              highlight={highlight}
              readAloud={readerReadAloud}
              translatedBlocks={translatedBlocks}
              onLookupDictionary={lookupDictionary}
              onToggleTranslation={toggleTranslation}
            />
          </div>
          {/**
            * スマホ幅はページの末尾に固定した「もう一度解く」「次の問題を解く」（高さ 69px）の上に 12px あけて止める
            */}
          <div className="pointer-events-none sticky bottom-[81px] z-10 mx-auto mt-8 max-w-3xl pl-11 sm:pl-14 lg:bottom-0">
            <div className="pointer-events-auto">
              {readAloud.playback !== null && !autoScroll.isFollowing && <ReturnToReadingButton onClick={resumeFollowing} />}
              <ReadAloudBar
                availability={readAloud.availability}
                blocks={result.blocks}
                isShortcutVisible={false}
                playback={readAloud.playback}
                progress={readAloud.progress}
                rate={readAloud.rate}
                onRateChange={readAloud.setRate}
                onStop={readAloud.stop}
                onToggle={toggleReadAloud}
              />
            </div>
          </div>
        </main>

        <aside aria-label="結果と解説" className="bg-surface lg:overflow-y-auto lg:border-l lg:border-line">
          <section className="border-b border-line px-5 pt-7 pb-6 sm:px-6">
            <ScoreSquares animate results={results} size="lg" />
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-[34px] leading-none font-semibold tracking-tight text-fg tabular-nums">
                {result.correct_count} / {result.question_count}
              </span>
              <span className="text-sm text-fg-muted">問正解</span>
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              <div className="col-span-2">
                <dt className="text-xs text-fg-muted">かかった時間</dt>
                <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums">
                  <span className="text-lg font-semibold text-fg">{formatSeconds(elapsedSeconds)}</span>
                  <span className="text-fg-muted">／ 制限 {formatSeconds(timeLimitSeconds)}</span>
                  {result.is_overtime && (
                    <span className="rounded border border-wrong/50 px-1.5 text-xs text-wrong">
                      {formatSeconds(elapsedSeconds - timeLimitSeconds)} 超過
                    </span>
                  )}
                </dd>
                <div aria-hidden className="relative mt-2 h-1.5 rounded-full bg-heat-0">
                  <div
                    className={`h-full rounded-full ${result.is_overtime ? "bg-wrong" : "bg-amber"}`}
                    style={{ width: `${(timeRatio / TIME_BAR_MAX_RATIO) * 100}%` }}
                  />
                  <span className="absolute -top-1 h-3.5 w-px bg-fg-muted" style={{ left: `${(1 / TIME_BAR_MAX_RATIO) * 100}%` }} />
                </div>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">読む速さ</dt>
                <dd className="mt-1 text-fg tabular-nums">
                  <span className="text-lg font-semibold">{result.words_per_minute ?? "―"}</span> WPM
                  <p className="text-xs text-fg-faint">設問を解く時間を含む</p>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">アシストの使用</dt>
                <dd className="mt-1 text-fg tabular-nums">
                  和訳 {result.translated_block_count} 段落
                  <p className="text-fg">設問の和訳 {result.translated_question_count} 問</p>
                  <p className="text-fg">単語 {result.word_lookup_count} 回</p>
                  <p className="text-fg">読み上げ {result.listened_block_count} 段落</p>
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="設問ごとの結果" className="divide-y divide-line border-b border-line">
            {questions.map((question, index) => {
              const isOpen = openQuestionIds.has(question.id)
              const isHighlighted = highlightQuestionId === question.id
              const isTranslated = question.prompt_ja !== null && translatedQuestionIds.has(question.id)
              return (
                <article key={question.id} className="px-5 py-4 sm:px-6">
                  <button
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
                    onClick={() => toggleQuestion(question.id)}
                    type="button"
                  >
                    <span className={`size-2.5 shrink-0 rounded-[2px] ${question.is_correct ? "bg-correct" : "border border-wrong bg-wrong-wash"}`} />
                    <span className="text-sm font-semibold text-fg">Q{index + 1}</span>
                    <span className="rounded border border-line-strong px-1.5 text-[11px] text-fg-muted">{QUESTION_TYPE_LABELS[question.type]}</span>
                    <span className={`text-sm ${question.is_correct ? "text-correct" : "text-wrong"}`}>
                      {question.is_correct ? "正解" : question.selected_choice_index === null ? "未回答" : "不正解"}
                    </span>
                    <span aria-hidden className={`ml-auto text-fg-faint transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="mt-3">
                      <div className="flex items-start gap-3">
                        <p className="flex-1 font-reading text-[16px] leading-relaxed text-fg">{question.prompt}</p>
                        {question.prompt_ja !== null && (
                          <QuestionTranslationToggle isTranslated={isTranslated} onToggle={() => toggleQuestionTranslation(question.id)} />
                        )}
                      </div>
                      {isTranslated && <p className="mt-1.5 font-ui text-[14px] leading-relaxed text-fg-muted">{question.prompt_ja}</p>}
                      <ul className="mt-3 space-y-1.5">
                        {question.choices.map((choice, choiceIndex) => (
                          <ChoiceRow
                            key={choiceIndex}
                            choice={choice}
                            index={choiceIndex}
                            isCorrectChoice={choiceIndex === question.correct_choice_index}
                            isUserChoice={choiceIndex === question.selected_choice_index}
                            translation={isTranslated && question.choices_ja !== null ? question.choices_ja[choiceIndex] : null}
                          />
                        ))}
                      </ul>
                      {/**
                        * 正解はいまの値、正誤は提出時の値なので、提出後に正解が直されると「あなたの回答 B・正解 B・不正解」のように食い違う
                        */}
                      {question.is_answer_key_changed && (
                        <p className="mt-2 text-xs leading-relaxed text-fg-muted">{ANSWER_KEY_CHANGED_NOTE}</p>
                      )}
                      <p className="mt-4 text-[14px] leading-[1.85] text-fg">{question.explanation_ja}</p>
                      {question.evidence !== null && (
                        <button
                          aria-pressed={isHighlighted}
                          className={`mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber/60 ${
                            isHighlighted ? "border-amber/60 bg-amber-wash text-amber" : "border-line-strong text-fg-muted hover:text-fg"
                          }`}
                          onClick={() => showEvidence(question)}
                          type="button"
                        >
                          <span aria-hidden className="size-1.5 rounded-full bg-current" />
                          {isHighlighted ? "本文で根拠を表示中" : "本文の根拠を見る"}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </section>

          <section className="border-b border-line px-5 py-5 sm:px-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-fg">調べた単語</h2>
              {result.word_lookups.length > 0 && (
                <Link className={`text-xs ${LINK_CLASS}`} href="/vocabulary">単語帳で復習する</Link>
              )}
            </div>
            {result.word_lookups.length === 0 ? (
              <p className="mt-3 text-[13px] text-fg-muted">この挑戦では単語を調べていません。</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {result.word_lookups.map((lookup, index) => (
                  <li key={`${lookup.source}-${lookup.lemma}-${index}`} className="flex items-baseline gap-3 py-2.5">
                    <span className="w-28 shrink-0 font-reading text-[15px] break-words text-fg">{lookup.surface}</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg-muted">{lookup.meaning_ja ?? "―"}</span>
                    <span className={`shrink-0 text-[11px] ${lookup.source === "glossary" ? "text-amber" : "text-fg-faint"}`}>
                      {lookup.source === "glossary" ? "文脈" : "辞書"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <AttributionSection attribution={result.attribution} />
        </aside>
      </div>

      {/**
        * 本文までスクロールしても下端に残るよう、2 カラムの外（ページの末尾）に置く
        */}
      <div className="sticky bottom-0 z-10 flex gap-2 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
        <Link
          className="grid h-11 flex-1 place-items-center rounded-lg border border-line-strong text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
          href={retryHref}
        >
          もう一度解く
        </Link>
        <Link
          className="grid h-11 flex-1 place-items-center rounded-lg bg-amber text-sm font-semibold text-amber-ink outline-none focus-visible:ring-2 focus-visible:ring-amber/60"
          href="/passages/random"
        >
          次の問題を解く
        </Link>
      </div>
    </div>
  )
}
