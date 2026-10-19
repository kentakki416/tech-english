"use client"

import type { Dispatch, SetStateAction } from "react"

import type { GetAdminPassageResponse } from "@repo/api-schema"

import Badge from "@/components/ui/badge/Badge"
import {
  createNewClientKey,
  formatBlockLabel,
  hasQuoteInText,
  type PassageErrorMarks,
  type PassageForm,
  type PassageFormQuestion,
} from "@/features/passage/passage.form"
import { type AdminQuestionType, CHOICE_LETTERS, QUESTION_TYPE_LABELS, QUESTION_TYPE_ORDER } from "@/features/passage/passage.labels"
import { hintClass, inputClass, labelClass, outlineButtonClass, selectClass, textareaClass } from "@/libs/ui-classes"

/**
 * 1 つの問題の設問数の上限・下限（保存できる範囲。公開には 3〜5 問が必要）
 */
const MAX_QUESTIONS = 5

const MIN_SAVABLE_QUESTIONS = 1

/**
 * 追加する設問の初期値。根拠の段落は最初の段落（無ければ先頭のブロック）
 */
const createEmptyQuestion = (clientKey: string, evidenceBlockIndex: number): PassageFormQuestion => ({
  id: null,
  choices: ["", "", "", ""],
  choices_ja: null,
  clientKey,
  correct_choice_index: 0,
  evidence: { block_index: evidenceBlockIndex, quote: "" },
  explanation_ja: "",
  prompt: "",
  prompt_ja: null,
  targetGlossaryKey: null,
  type: "detail",
  verification_choice_index: null,
})

/**
 * 選択肢の和訳の 1 つを書き換える。和訳がまだ無い（null）なら、選択肢と同じ数の空の和訳から始める
 */
const updateChoiceTranslation = (question: PassageFormQuestion, choiceIndex: number, value: string): PassageFormQuestion => {
  const choicesJa = question.choices_ja ?? question.choices.map(() => "")
  return { ...question, choices_ja: choicesJa.map((current, index) => (index === choiceIndex ? value : current)) }
}

/**
 * 設問タブ。設問ごとの開閉できるカード（開くとプレビューがその根拠までスクロールしてハイライトする）
 */
export function QuestionsTab({
  attemptCount,
  blocks,
  form,
  isEditable,
  marks,
  openQuestionKey,
  recommendedQuestionCount,
  showVerificationMismatch,
  wordCount,
  onChange,
  onOpenQuestionChange,
}: {
  attemptCount: number
  blocks: GetAdminPassageResponse["blocks"]
  form: PassageForm
  isEditable: boolean
  marks: PassageErrorMarks
  openQuestionKey: string | null
  /**
   * 英単語数から決まる目安の設問数（詳細の recommended_question_count。境界は API の domain が持つ）
   */
  recommendedQuestionCount: number
  /**
   * 検証モデルとの食い違いのバッジを出すか（公開中は出さない）
   */
  showVerificationMismatch: boolean
  wordCount: number
  onChange: Dispatch<SetStateAction<PassageForm>>
  /**
   * 設問を開く・閉じる。evidenceBlockIndex を渡したら、プレビューをその根拠までスクロールする
   */
  onOpenQuestionChange: (key: string | null, evidenceBlockIndex?: number) => void
}) {
  /**
   * 挑戦がある問題は設問の数を変えられない（API も 409 を返す）
   */
  const canChangeCount = isEditable && attemptCount === 0
  const defaultEvidenceBlockIndex = Math.max(0, blocks.findIndex((block) => block.type !== "code" && block.type !== "heading"))

  const updateQuestion = (key: string, update: (question: PassageFormQuestion) => PassageFormQuestion) =>
    onChange((current) => ({
      ...current,
      questions: current.questions.map((question) => (question.clientKey === key ? update(question) : question)),
    }))

  const addQuestion = () => {
    const key = createNewClientKey(form.questions.map((question) => question.clientKey))
    onChange((current) => ({ ...current, questions: [...current.questions, createEmptyQuestion(key, defaultEvidenceBlockIndex)] }))
    onOpenQuestionChange(key, defaultEvidenceBlockIndex)
  }

  const deleteQuestion = (key: string) => {
    onChange((current) => ({ ...current, questions: current.questions.filter((question) => question.clientKey !== key) }))
    onOpenQuestionChange(null)
  }

  return (
    <>
      {form.questions.length === 0 && <p className="text-theme-sm text-gray-500 dark:text-gray-400">設問はまだありません。</p>}
      {form.questions.map((question, index) => {
        const key = question.clientKey
        const isOpen = openQuestionKey === key
        const verificationIndex = question.verification_choice_index
        const isMismatch = verificationIndex !== null && verificationIndex !== question.correct_choice_index
        const isEvidenceFound = hasQuoteInText(form.blocks[question.evidence.block_index]?.text ?? "", question.evidence.quote)
        const hasEvidenceError = marks.evidenceQuestionKeys.includes(key) && !isEvidenceFound

        return (
          <div key={key} className={`rounded-xl border ${isOpen ? "border-brand-300 dark:border-brand-800" : "border-gray-200 dark:border-gray-800"}`}>
            <button
              aria-expanded={isOpen}
              className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
              onClick={() => (isOpen ? onOpenQuestionChange(null) : onOpenQuestionChange(key, question.evidence.block_index))}
              type="button"
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">Q{index + 1}</span>
              <span className="text-theme-sm text-gray-500 dark:text-gray-400">{QUESTION_TYPE_LABELS[question.type]}</span>
              {showVerificationMismatch && isMismatch && <Badge color="warning" size="sm">検証モデルは {CHOICE_LETTERS[verificationIndex]} を選択</Badge>}
              {hasEvidenceError && <Badge color="error" size="sm">根拠が見つかりません</Badge>}
              <span aria-hidden className={`ml-auto text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {isOpen && (
              <fieldset className="space-y-4 border-t border-gray-100 px-4 pt-4 pb-5 dark:border-gray-800" disabled={!isEditable}>
                <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                  <div>
                    <label className={labelClass} htmlFor={`type-${key}`}>種類</label>
                    <select
                      className={selectClass}
                      id={`type-${key}`}
                      onChange={(event) => updateQuestion(key, (current) => ({ ...current, type: event.target.value as AdminQuestionType }))}
                      value={question.type}
                    >
                      {QUESTION_TYPE_ORDER.map((type) => <option key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`prompt-${key}`}>設問文（英語）</label>
                    <textarea
                      className={textareaClass}
                      id={`prompt-${key}`}
                      onChange={(event) => updateQuestion(key, (current) => ({ ...current, prompt: event.target.value }))}
                      rows={2}
                      value={question.prompt}
                    />
                    <label className={`${labelClass} mt-3`} htmlFor={`prompt-ja-${key}`}>設問文（和訳）</label>
                    <textarea
                      className={textareaClass}
                      id={`prompt-ja-${key}`}
                      onChange={(event) => updateQuestion(key, (current) => ({ ...current, prompt_ja: event.target.value }))}
                      rows={2}
                      value={question.prompt_ja ?? ""}
                    />
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
                            checked={choiceIndex === question.correct_choice_index}
                            className="size-4 shrink-0 accent-success-500"
                            name={`correct-${key}`}
                            onChange={() => updateQuestion(key, (current) => ({ ...current, correct_choice_index: choiceIndex }))}
                            type="radio"
                          />
                          <span className="w-4 shrink-0 font-mono text-theme-xs text-gray-400">{CHOICE_LETTERS[choiceIndex]}</span>
                          <input
                            aria-label={`選択肢 ${CHOICE_LETTERS[choiceIndex]}`}
                            className={`${inputClass} h-10`}
                            onChange={(event) =>
                              updateQuestion(key, (current) => ({
                                ...current,
                                choices: current.choices.map((value, valueIndex) => (valueIndex === choiceIndex ? event.target.value : value)),
                              }))}
                            value={choice}
                          />
                          {choiceIndex === verificationIndex && (
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
                              onChange={(event) => updateQuestion(key, (current) => updateChoiceTranslation(current, choiceIndex, event.target.value))}
                              placeholder="和訳"
                              value={question.choices_ja?.[choiceIndex] ?? ""}
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
                  <label className={labelClass} htmlFor={`explanation-${key}`}>解説（日本語）</label>
                  <textarea
                    className={textareaClass}
                    id={`explanation-${key}`}
                    onChange={(event) => updateQuestion(key, (current) => ({ ...current, explanation_ja: event.target.value }))}
                    rows={4}
                    value={question.explanation_ja}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <div>
                    <label className={labelClass} htmlFor={`evidence-block-${key}`}>根拠の段落</label>
                    <select
                      className={selectClass}
                      id={`evidence-block-${key}`}
                      onChange={(event) => {
                        const blockIndex = Number(event.target.value)
                        updateQuestion(key, (current) => ({ ...current, evidence: { ...current.evidence, block_index: blockIndex } }))
                        onOpenQuestionChange(key, blockIndex)
                      }}
                      value={question.evidence.block_index}
                    >
                      {blocks.map((_block, blockIndex) => (
                        <option key={blockIndex} value={blockIndex}>{formatBlockLabel(blocks, blockIndex)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`evidence-quote-${key}`}>根拠の引用（本文と同じ表記）</label>
                    <textarea
                      className={`${textareaClass} ${hasEvidenceError ? "border-error-500 dark:border-error-500" : ""}`}
                      id={`evidence-quote-${key}`}
                      onChange={(event) => updateQuestion(key, (current) => ({ ...current, evidence: { ...current.evidence, quote: event.target.value } }))}
                      rows={2}
                      value={question.evidence.quote}
                    />
                    <p className={`mt-1.5 text-theme-xs ${isEvidenceFound ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500"}`}>
                      {isEvidenceFound ? "本文に見つかりました（プレビューでハイライト中）" : "本文に見つかりません"}
                    </p>
                  </div>
                </div>
                {question.type === "vocabulary" && (
                  <div>
                    <label className={labelClass} htmlFor={`target-${key}`}>対象の語句（用語集）</label>
                    <select
                      className={`${selectClass} sm:w-72`}
                      id={`target-${key}`}
                      onChange={(event) => updateQuestion(key, (current) => ({ ...current, targetGlossaryKey: event.target.value || null }))}
                      value={question.targetGlossaryKey ?? ""}
                    >
                      <option value="">選択してください</option>
                      {form.glossary.map((entry) => <option key={entry.clientKey} value={entry.clientKey}>{entry.surface}</option>)}
                    </select>
                    <p className={hintClass}>解答中はこの語句を用語集から外し、結果画面では表示します。</p>
                  </div>
                )}
                {isEditable && (
                  <div className="flex justify-end">
                    <button
                      className="text-theme-sm text-error-600 hover:text-error-700 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-error-500 dark:disabled:text-gray-600"
                      disabled={!canChangeCount || form.questions.length <= MIN_SAVABLE_QUESTIONS}
                      onClick={() => deleteQuestion(key)}
                      type="button"
                    >
                      この設問を削除
                    </button>
                  </div>
                )}
              </fieldset>
            )}
          </div>
        )
      })}
      {isEditable && (
        <div className="flex items-center justify-between gap-4">
          <div className="text-theme-xs text-gray-500 dark:text-gray-400">
            <p>設問は 3〜5 問。英単語数 {wordCount} 語なので {recommendedQuestionCount} 問が目安です。</p>
            {attemptCount > 0 && <p className="mt-1">挑戦がある問題は、設問の追加・削除ができません（設問文・選択肢・正解・解説は修正できます）。</p>}
          </div>
          <button
            className={`${outlineButtonClass} shrink-0 disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={!canChangeCount || form.questions.length >= MAX_QUESTIONS}
            onClick={addQuestion}
            type="button"
          >
            設問を追加
          </button>
        </div>
      )}
    </>
  )
}
