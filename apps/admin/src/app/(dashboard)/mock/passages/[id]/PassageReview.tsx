"use client"

import Link from "next/link"
import { useState } from "react"

import Badge from "@/components/ui/badge/Badge"
import { Modal } from "@/components/ui/modal"
import { type Column, DataTable } from "@/components/ui/table"
import {
  type AdminGlossaryEntry,
  calculateTimeLimitSeconds,
  formatSeconds,
  MOCK_BLOCKS,
  MOCK_GLOSSARY,
  MOCK_PASSAGE_DETAIL,
  MOCK_QUESTIONS,
  QUESTION_TYPE_OPTIONS,
} from "@/libs/mock-data"

import {
  cardClass,
  dangerOutlineButtonClass,
  hintClass,
  inputClass,
  labelClass,
  outlineButtonClass,
  primaryButtonClass,
  selectClass,
  textareaClass,
  titleClass,
} from "../../_components/ui"

import { PassagePreview } from "./PassagePreview"

export type ReviewMockState = "draft" | "publish-error" | "published" | "reject"

type TabKey = "basics" | "body" | "glossary" | "questions" | "translations"

const TABS: { key: TabKey, label: string }[] = [
  { key: "questions", label: `設問（${MOCK_QUESTIONS.length}）` },
  { key: "translations", label: "和訳" },
  { key: "glossary", label: `用語集（${MOCK_GLOSSARY.length}）` },
  { key: "body", label: "本文" },
  { key: "basics", label: "基本情報" },
]

const CHOICE_LETTERS = ["A", "B", "C", "D"]

const PARAGRAPH_OPTIONS = MOCK_BLOCKS.flatMap((block, blockIndex) => (block.type === "paragraph" ? [blockIndex] : []))

const PUBLISH_ERRORS = [
  "Q2：根拠の引用が段落 2 の本文に見つかりません",
  "段落 4 の和訳が空です",
]

const VOCABULARY_TARGET_IDS = MOCK_QUESTIONS.flatMap(question => (question.targetGlossaryEntryId ? [question.targetGlossaryEntryId] : []))

const GLOSSARY_COLUMNS: Column<AdminGlossaryEntry>[] = [
  {
    className: "w-44 px-5 py-4 text-theme-sm",
    header: "語句",
    render: entry => (
      <div>
        <p className="font-medium text-gray-800 dark:text-white/90">{entry.surface}</p>
        <p className="text-theme-xs text-gray-400">
          {entry.lemma !== entry.surface.toLowerCase() && <span className="mr-1.5">{entry.lemma}</span>}
          {entry.partOfSpeech}
          <span className="ml-1.5">段落 {PARAGRAPH_OPTIONS.indexOf(entry.blockIndex) + 1}</span>
        </p>
        {VOCABULARY_TARGET_IDS.includes(entry.id) && <span className="mt-1 inline-block whitespace-nowrap"><Badge color="info" size="sm">語義設問の対象</Badge></span>}
      </div>
    ),
  },
  {
    className: "px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300",
    header: "文脈での意味",
    render: entry => (
      <div>
        {entry.meaningJa}
        {entry.noteJa && <p className="mt-0.5 text-theme-xs text-gray-400">{entry.noteJa}</p>}
      </div>
    ),
  },
  {
    className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
    header: "",
    render: () => (
      <>
        <button className="mr-3 text-brand-500 hover:text-brand-600" type="button">編集</button>
        <button className="text-error-600 hover:text-error-700 dark:text-error-500" type="button">削除</button>
      </>
    ),
  },
]

function Notice({ items, title, tone }: { items: string[], title: string, tone: "error" | "info" | "warning" }) {
  const toneClass = {
    error: "border-error-500 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15",
    info: "border-blue-light-500 bg-blue-light-50 dark:border-blue-light-500/30 dark:bg-blue-light-500/15",
    warning: "border-warning-500 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15",
  }[tone]
  return (
    <div className={`rounded-xl border p-4 text-sm ${toneClass}`}>
      <p className="font-medium text-gray-800 dark:text-white/90">{title}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-gray-600 dark:text-gray-300">
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

/**
 * 問題の確認・修正（モック）
 */
export function PassageReview({ initialState }: { initialState: ReviewMockState }) {
  const isPublished = initialState === "published"
  const [tab, setTab] = useState<TabKey>("questions")
  const [openQuestionId, setOpenQuestionId] = useState<number | null>(3)
  const [showGlossary, setShowGlossary] = useState(true)
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [isRejectOpen, setIsRejectOpen] = useState(initialState === "reject")
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [recalculated, setRecalculated] = useState(false)

  const detail = MOCK_PASSAGE_DETAIL
  const openQuestion = MOCK_QUESTIONS.find(question => question.id === openQuestionId)
  const highlight = tab === "questions" && openQuestion ? openQuestion.evidence : null
  const calculated = calculateTimeLimitSeconds(detail.wordCount, 2, MOCK_QUESTIONS.length)

  const toggleTranslation = (blockIndex: number) =>
    setTranslatedBlocks((value) => {
      const next = new Set(value)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })

  const openQuestionAndShowEvidence = (questionId: number) => {
    const isClosing = openQuestionId === questionId
    setOpenQuestionId(isClosing ? null : questionId)
    if (isClosing) return
    const blockIndex = MOCK_QUESTIONS.find(question => question.id === questionId)?.evidence.blockIndex
    window.requestAnimationFrame(() => document.getElementById(`preview-block-${blockIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} px-6 py-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={isPublished ? "success" : "primary"} size="sm">{isPublished ? "公開" : "下書き"}</Badge>
              {!isPublished && detail.attentionReasons.length > 0 && <Badge color="warning" size="sm">要確認</Badge>}
            </div>
            <h3 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{detail.title}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {isPublished ? (
              <button className={outlineButtonClass} type="button">非公開に戻す</button>
            ) : (
              <>
                <button className={outlineButtonClass} onClick={() => setIsRegenerateOpen(true)} type="button">再生成</button>
                <button className={dangerOutlineButtonClass} onClick={() => setIsRejectOpen(true)} type="button">却下</button>
                <button className={outlineButtonClass} onClick={() => setSavedMessage("下書きを保存しました")} type="button">保存</button>
                <button className={primaryButtonClass} type="button">公開する</button>
              </>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-100 pt-4 text-theme-sm sm:grid-cols-4 dark:border-gray-800">
          <div>
            <dt className="text-gray-400">ソース</dt>
            <dd className="mt-0.5 text-gray-800 dark:text-white/90">{detail.sourceName}</dd>
          </div>
          <div className="col-span-2 min-w-0">
            <dt className="text-gray-400">取得元</dt>
            <dd className="mt-0.5 truncate font-mono text-theme-xs text-gray-800 dark:text-white/90">
              {detail.sourcePath}
              <span className="ml-2 text-gray-400">@{detail.sourceCommitSha}</span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">英単語数</dt>
            <dd className="mt-0.5 text-gray-800 tabular-nums dark:text-white/90">{detail.wordCount} 語</dd>
          </div>
          <div>
            <dt className="text-gray-400">生成モデル</dt>
            <dd className="mt-0.5 font-mono text-theme-xs text-gray-800 dark:text-white/90">{detail.generationModel}</dd>
          </div>
          <div>
            <dt className="text-gray-400">プロンプトの版</dt>
            <dd className="mt-0.5 font-mono text-theme-xs text-gray-800 dark:text-white/90">{detail.generationPromptVersion}</dd>
          </div>
          <div>
            <dt className="text-gray-400">生成日時</dt>
            <dd className="mt-0.5 text-gray-800 dark:text-white/90">{detail.generatedAt}</dd>
          </div>
          <div>
            <dt className="text-gray-400">制限時間</dt>
            <dd className="mt-0.5 text-gray-800 tabular-nums dark:text-white/90">{formatSeconds(detail.timeLimitSeconds)}</dd>
          </div>
        </dl>
        {savedMessage && <p className="mt-3 text-theme-sm text-success-600 dark:text-success-500" role="status">{savedMessage}</p>}
      </section>

      {isPublished && (
        <Notice
          items={["非公開に戻してから修正してください。", "128 件の挑戦があるため、設問の数の変更と再生成はできません（設問文・選択肢・正解・解説は修正できます）。"]}
          title="公開中の問題は編集できません"
          tone="info"
        />
      )}
      {initialState === "publish-error" && <Notice items={PUBLISH_ERRORS} title="公開の条件を満たしていないため、公開できません" tone="error" />}
      {!isPublished && detail.attentionReasons.length > 0 && <Notice items={detail.attentionReasons} title="要確認" tone="warning" />}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={`${cardClass} min-w-0 self-start xl:sticky xl:top-24`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div>
              <h3 className={titleClass}>プレビュー</h3>
              <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">ユーザーの解答画面と同じ見た目</p>
            </div>
            <div className="flex flex-wrap gap-4 text-theme-sm text-gray-700 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input checked={showGlossary} className="size-4 accent-brand-500" onChange={event => setShowGlossary(event.target.checked)} type="checkbox" />
                用語集の下線
              </label>
              <label className="flex items-center gap-2">
                <input checked={showAllTranslations} className="size-4 accent-brand-500" onChange={event => setShowAllTranslations(event.target.checked)} type="checkbox" />
                全文訳
              </label>
            </div>
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto border-t border-gray-100 p-3 dark:border-gray-800">
            <PassagePreview
              blocks={MOCK_BLOCKS}
              glossary={MOCK_GLOSSARY}
              highlight={highlight}
              showAllTranslations={showAllTranslations}
              showGlossary={showGlossary}
              translatedBlocks={translatedBlocks}
              vocabularyTargetIds={VOCABULARY_TARGET_IDS}
              onToggleTranslation={toggleTranslation}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-100 px-6 py-3 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-b-2 border-dotted border-[#f3b24c]" />用語集の語句</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-b-2 border-dashed border-[#90c6f0]" />語義設問の対象（解答中は非表示）</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-[#f3b24c]/30 ring-1 ring-[#f3b24c]/60" />開いている設問の根拠</span>
          </div>
        </section>

        <section className={`${cardClass} min-w-0`}>
          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-4 pt-3 dark:border-gray-800" role="tablist">
            {TABS.map(item => (
              <button
                key={item.key}
                aria-selected={tab === item.key}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-theme-sm font-medium transition-colors ${
                  tab === item.key ? "border-brand-500 text-brand-500" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
                onClick={() => setTab(item.key)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          <fieldset className="min-w-0 space-y-4 p-4 sm:p-6" disabled={isPublished && tab !== "questions"}>
            {tab === "questions" && (
              <>
                {MOCK_QUESTIONS.map((question, index) => {
                  const isOpen = openQuestionId === question.id
                  const isMismatch = question.verificationChoiceIndex !== question.correctChoiceIndex
                  const hasPublishError = initialState === "publish-error" && question.id === 2
                  return (
                    <div key={question.id} className={`rounded-xl border ${isOpen ? "border-brand-300 dark:border-brand-800" : "border-gray-200 dark:border-gray-800"}`}>
                      <button
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left"
                        onClick={() => openQuestionAndShowEvidence(question.id)}
                        type="button"
                      >
                        <span className="text-sm font-semibold text-gray-800 dark:text-white/90">Q{index + 1}</span>
                        <span className="text-theme-sm text-gray-500 dark:text-gray-400">{QUESTION_TYPE_OPTIONS.find(option => option.value === question.type)?.label}</span>
                        {!isPublished && isMismatch && <Badge color="warning" size="sm">検証モデルは {CHOICE_LETTERS[question.verificationChoiceIndex]} を選択</Badge>}
                        {hasPublishError && <Badge color="error" size="sm">根拠が見つかりません</Badge>}
                        <span aria-hidden className={`ml-auto text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                      </button>
                      {isOpen && (
                        <fieldset className="space-y-4 border-t border-gray-100 px-4 pt-4 pb-5 dark:border-gray-800" disabled={isPublished}>
                          <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                            <div>
                              <label className={labelClass} htmlFor={`type-${question.id}`}>種類</label>
                              <select className={selectClass} defaultValue={question.type} id={`type-${question.id}`}>
                                {QUESTION_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`prompt-${question.id}`}>設問文（英語）</label>
                              <textarea className={textareaClass} defaultValue={question.prompt} id={`prompt-${question.id}`} rows={2} />
                              <label className={`${labelClass} mt-3`} htmlFor={`prompt-ja-${question.id}`}>設問文（和訳）</label>
                              <textarea className={textareaClass} defaultValue={question.promptJa} id={`prompt-ja-${question.id}`} rows={2} />
                            </div>
                          </div>
                          <div>
                            <p className={labelClass}>{question.type === "vocabulary" ? "選択肢（ラジオで正解を選ぶ）" : "選択肢（ラジオで正解を選ぶ。下の行は和訳）"}</p>
                            <div className="space-y-3">
                              {question.choices.map((choice, choiceIndex) => (
                                <div key={choiceIndex} className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <input
                                      aria-label={`${CHOICE_LETTERS[choiceIndex]} を正解にする`}
                                      className="size-4 shrink-0 accent-success-500"
                                      defaultChecked={choiceIndex === question.correctChoiceIndex}
                                      name={`correct-${question.id}`}
                                      type="radio"
                                    />
                                    <span className="w-4 shrink-0 font-mono text-theme-xs text-gray-400">{CHOICE_LETTERS[choiceIndex]}</span>
                                    <input className={`${inputClass} h-10`} defaultValue={choice} />
                                    {choiceIndex === question.verificationChoiceIndex && (
                                      <span className={`shrink-0 text-theme-xs ${isMismatch ? "text-warning-600 dark:text-orange-400" : "text-gray-400"}`}>
                                        検証モデルの回答
                                      </span>
                                    )}
                                  </div>
                                  {question.type !== "vocabulary" && (
                                    <div className="pl-12">
                                      <input
                                        aria-label={`選択肢 ${CHOICE_LETTERS[choiceIndex]} の和訳`}
                                        className={`${inputClass} h-9`}
                                        defaultValue={question.choicesJa?.[choiceIndex]}
                                        placeholder="和訳"
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            {question.type === "vocabulary" && <p className={hintClass}>語義の設問は選択肢を訳しません（和訳から答えが分かってしまうため）。</p>}
                            <p className={hintClass}>保存時に選択肢の順番は変えません（シャッフルは生成時だけ）。</p>
                          </div>
                          <div>
                            <label className={labelClass} htmlFor={`explanation-${question.id}`}>解説（日本語）</label>
                            <textarea className={textareaClass} defaultValue={question.explanationJa} id={`explanation-${question.id}`} rows={4} />
                          </div>
                          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                            <div>
                              <label className={labelClass} htmlFor={`evidence-block-${question.id}`}>根拠の段落</label>
                              <select className={selectClass} defaultValue={question.evidence.blockIndex} id={`evidence-block-${question.id}`}>
                                {PARAGRAPH_OPTIONS.map((blockIndex, paragraphIndex) => <option key={blockIndex} value={blockIndex}>段落 {paragraphIndex + 1}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass} htmlFor={`evidence-quote-${question.id}`}>根拠の引用（本文と同じ表記）</label>
                              <textarea className={textareaClass} defaultValue={question.evidence.quote} id={`evidence-quote-${question.id}`} rows={2} />
                              <p className={`mt-1.5 text-theme-xs ${hasPublishError ? "text-error-600 dark:text-error-500" : "text-success-600 dark:text-success-500"}`}>
                                {hasPublishError ? "本文に見つかりません" : "本文に見つかりました（プレビューでハイライト中）"}
                              </p>
                            </div>
                          </div>
                          {question.type === "vocabulary" && (
                            <div>
                              <label className={labelClass} htmlFor={`target-${question.id}`}>対象の語句（用語集）</label>
                              <select className={`${selectClass} sm:w-72`} defaultValue={question.targetGlossaryEntryId} id={`target-${question.id}`}>
                                {MOCK_GLOSSARY.map(entry => <option key={entry.id} value={entry.id}>{entry.surface}</option>)}
                              </select>
                              <p className={hintClass}>解答中はこの語句を用語集から外し、結果画面では表示します。</p>
                            </div>
                          )}
                          {!isPublished && (
                            <div className="flex justify-end">
                              <button className="text-theme-sm text-error-600 hover:text-error-700 dark:text-error-500" type="button">この設問を削除</button>
                            </div>
                          )}
                        </fieldset>
                      )}
                    </div>
                  )
                })}
                {!isPublished && (
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">設問は 3〜5 問。英単語数 332 語なので 4 問が目安です。</p>
                    <button className={outlineButtonClass} type="button">設問を追加</button>
                  </div>
                )}
              </>
            )}

            {tab === "translations" && (
              <>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">コード以外のすべてのブロックに和訳が必要です。カタカナ語・英語のまま使うのが一般的な用語は無理に訳しません。</p>
                {MOCK_BLOCKS.map((block, blockIndex) => {
                  if (block.type === "code") return null
                  const paragraphIndex = PARAGRAPH_OPTIONS.indexOf(blockIndex)
                  const isMissing = initialState === "publish-error" && paragraphIndex === 3
                  return (
                    <div key={blockIndex}>
                      <label className={labelClass} htmlFor={`translation-${blockIndex}`}>
                        {block.type === "heading" ? "見出し" : `段落 ${paragraphIndex + 1}`}
                      </label>
                      <p className="mb-2 line-clamp-2 text-theme-xs text-gray-400">{block.text}</p>
                      <textarea
                        className={`${textareaClass} ${isMissing ? "border-error-500 dark:border-error-500" : ""}`}
                        defaultValue={isMissing ? "" : block.translationJa}
                        id={`translation-${blockIndex}`}
                        placeholder="和訳を入力"
                        rows={block.type === "heading" ? 1 : 4}
                      />
                      {isMissing && <p className="mt-1.5 text-theme-xs text-error-600 dark:text-error-500">和訳が空です</p>}
                    </div>
                  )
                })}
              </>
            )}

            {tab === "glossary" && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <p className="text-theme-sm text-gray-500 dark:text-gray-400">語句は本文と同じ表記で登録します。保存時に本文中の位置を再計算します。</p>
                  <button className={`${outlineButtonClass} shrink-0`} type="button">語句を追加</button>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[480px]">
                    <DataTable columns={GLOSSARY_COLUMNS} data={MOCK_GLOSSARY} getRowKey={entry => entry.id} />
                  </div>
                </div>
              </>
            )}

            {tab === "body" && (
              <>
                <div className="rounded-xl border border-warning-500 bg-warning-50 p-4 text-theme-sm text-gray-600 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-gray-300">
                  英文の修正は、抽出で混ざった不要な文字の削除など軽微なものに留めてください。保存時に用語集と根拠の位置を再計算し、見つからない語句はエラーになります。
                </div>
                {MOCK_BLOCKS.map((block, blockIndex) => (
                  <div key={blockIndex}>
                    <label className={labelClass} htmlFor={`body-${blockIndex}`}>
                      {block.type === "heading" ? "見出し" : block.type === "code" ? `コード（${block.lang}）` : `段落 ${PARAGRAPH_OPTIONS.indexOf(blockIndex) + 1}`}
                    </label>
                    <textarea
                      className={`${textareaClass} ${block.type === "code" ? "font-mono text-theme-xs" : ""}`}
                      defaultValue={block.text}
                      id={`body-${blockIndex}`}
                      rows={block.type === "heading" ? 1 : block.type === "code" ? 7 : 5}
                    />
                  </div>
                ))}
              </>
            )}

            {tab === "basics" && (
              <>
                <div>
                  <label className={labelClass} htmlFor="title">タイトル</label>
                  <input className={inputClass} defaultValue={detail.title} id="title" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="difficulty">難易度</label>
                    <select className={selectClass} defaultValue={detail.difficulty} id="difficulty">
                      <option value={1}>Easy</option>
                      <option value={2}>Normal</option>
                      <option value={3}>Hard</option>
                    </select>
                    <p className={hintClass}>LLM の判定：Normal</p>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="time-limit">制限時間</label>
                    <div className="flex gap-2">
                      <input className={`${inputClass} tabular-nums`} defaultValue={formatSeconds(detail.timeLimitSeconds)} id="time-limit" key={String(recalculated)} />
                      <button className={`${outlineButtonClass} shrink-0`} onClick={() => setRecalculated(true)} type="button">計算式で再計算</button>
                    </div>
                    {recalculated && (
                      <p className={hintClass}>
                        332 語 ÷ 120 WPM × 60 ＋ 4 問 × 40 秒 ＝ 326 秒 → 30 秒単位に切り上げて {formatSeconds(calculated)}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </fieldset>
        </section>
      </div>

      <div className="flex justify-start">
        <Link className="text-theme-sm text-gray-500 hover:text-gray-700 dark:text-gray-400" href="/mock/passages">問題一覧に戻る</Link>
      </div>

      <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen={isRejectOpen} onClose={() => setIsRejectOpen(false)}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">この問題を却下する</h4>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">却下した問題はユーザーに表示されません。あとから「再生成」で生成待ちに戻せます。</p>
        <label className={`${labelClass} mt-5`} htmlFor="reject-reason">却下の理由（必須）</label>
        <textarea className={textareaClass} id="reject-reason" placeholder="例：コード例が中心で、読解の題材になる文章が短い" rows={3} />
        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={() => setIsRejectOpen(false)} type="button">キャンセル</button>
          <button className="inline-flex items-center justify-center rounded-lg bg-error-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-error-600" type="button">却下する</button>
        </div>
      </Modal>

      <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen={isRegenerateOpen} onClose={() => setIsRegenerateOpen(false)}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">問題を再生成する</h4>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          生成した設問・和訳・用語集を削除して、生成待ち（収集済み）に戻します。次回の生成タスクで作り直されます。修正した内容も消えます。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={() => setIsRegenerateOpen(false)} type="button">キャンセル</button>
          <button className={primaryButtonClass} type="button">再生成する</button>
        </div>
      </Modal>
    </div>
  )
}
