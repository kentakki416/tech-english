"use client"

import { type Dispatch, type SetStateAction, useState } from "react"

import type { GetAdminPassageResponse } from "@repo/api-schema"

import {
  calculateTimeLimit,
  convertTimeLimitTextToSeconds,
  formatSeconds,
  type PassageErrorMarks,
  type PassageForm,
  type TimeLimitCalculation,
} from "@/features/passage/passage.form"
import { type AdminPassageDifficulty, PASSAGE_DIFFICULTY_LABELS, PASSAGE_DIFFICULTY_ORDER } from "@/features/passage/passage.labels"
import { hintClass, inputClass, labelClass, outlineButtonClass, selectClass } from "@/libs/ui-classes"

const errorBorderClass = "border-error-500 dark:border-error-500"

/**
 * 切り上げ前の秒数の表示（割り切れないときは小数 1 桁）
 */
const formatRawSeconds = (seconds: number): string => (Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1))

/**
 * 基本情報タブ。タイトル・難易度・制限時間（`m:ss`）。「計算式で再計算」は API から受け取った式の定数で計算し、過程を出す
 */
export function BasicsTab({
  form,
  formula,
  marks,
  wordCount,
  onChange,
}: {
  form: PassageForm
  formula: GetAdminPassageResponse["time_limit_formula"]
  marks: PassageErrorMarks
  wordCount: number
  onChange: Dispatch<SetStateAction<PassageForm>>
}) {
  const [calculation, setCalculation] = useState<(TimeLimitCalculation & { questionCount: number }) | null>(null)
  const hasTitleError = marks.hasTitleError && form.title.trim().length === 0
  const hasTimeLimitError = marks.hasTimeLimitError && convertTimeLimitTextToSeconds(form.timeLimitText) === null

  const recalculateTimeLimit = () => {
    const questionCount = form.questions.length
    const result = calculateTimeLimit(formula, { difficulty: form.difficulty, questionCount, wordCount })
    if (!result) return
    setCalculation({ ...result, questionCount })
    onChange((current) => ({ ...current, timeLimitText: formatSeconds(result.seconds) }))
  }

  return (
    <>
      <div>
        <label className={labelClass} htmlFor="title">タイトル</label>
        <input
          className={`${inputClass} ${hasTitleError ? errorBorderClass : ""}`}
          id="title"
          onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
          value={form.title}
        />
        {hasTitleError && <p className="mt-1.5 text-theme-xs text-error-600 dark:text-error-500">タイトルを入力してください</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="difficulty">難易度</label>
          <select
            className={selectClass}
            id="difficulty"
            onChange={(event) => onChange((current) => ({ ...current, difficulty: Number(event.target.value) as AdminPassageDifficulty }))}
            value={form.difficulty}
          >
            {PASSAGE_DIFFICULTY_ORDER.map((difficulty) => <option key={difficulty} value={difficulty}>{PASSAGE_DIFFICULTY_LABELS[difficulty]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="time-limit">制限時間</label>
          <div className="flex gap-2">
            <input
              className={`${inputClass} tabular-nums ${hasTimeLimitError ? errorBorderClass : ""}`}
              id="time-limit"
              onChange={(event) => onChange((current) => ({ ...current, timeLimitText: event.target.value }))}
              placeholder="5:30"
              value={form.timeLimitText}
            />
            <button className={`${outlineButtonClass} shrink-0`} onClick={recalculateTimeLimit} type="button">計算式で再計算</button>
          </div>
          {hasTimeLimitError && <p className="mt-1.5 text-theme-xs text-error-600 dark:text-error-500">m:ss の形で入力してください（例 5:30）</p>}
          {calculation && (
            <p className={hintClass}>
              {wordCount} 語 ÷ {calculation.wpm} WPM × 60 ＋ {calculation.questionCount} 問 × {formula.seconds_per_question} 秒 ＝ {formatRawSeconds(calculation.rawSeconds)} 秒 → {formula.rounding_seconds} 秒単位に切り上げて {formatSeconds(calculation.seconds)}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
