"use client"

import type { Dispatch, SetStateAction } from "react"

import type { GetAdminPassageResponse } from "@repo/api-schema"

import { formatBlockLabel, type PassageErrorMarks, type PassageForm } from "@/features/passage/passage.form"
import { labelClass, textareaClass } from "@/libs/ui-classes"

/**
 * 本文タブ。ブロックごとの英文のテキストエリア（コードは等幅）。ブロックの数と種類は変えられない
 */
export function BodyTab({
  blocks,
  form,
  marks,
  onChange,
}: {
  blocks: GetAdminPassageResponse["blocks"]
  form: PassageForm
  marks: PassageErrorMarks
  onChange: Dispatch<SetStateAction<PassageForm>>
}) {
  const updateText = (blockIndex: number, text: string) =>
    onChange((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) => (index === blockIndex ? { ...block, text } : block)),
    }))

  return (
    <>
      <div className="rounded-xl border border-warning-500 bg-warning-50 p-4 text-theme-sm text-gray-600 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-gray-300">
        英文の修正は、抽出で混ざった不要な文字の削除など軽微なものに留めてください。保存時に用語集と根拠の位置を再計算し、見つからない語句はエラーになります。
      </div>
      {blocks.map((block, blockIndex) => {
        const text = form.blocks[blockIndex]?.text ?? ""
        const isBlank = marks.textBlockIndexes.includes(blockIndex) && text.trim().length === 0
        return (
          <div key={blockIndex}>
            <label className={labelClass} htmlFor={`body-${blockIndex}`}>{formatBlockLabel(blocks, blockIndex)}</label>
            <textarea
              className={`${textareaClass} ${block.type === "code" ? "font-mono text-theme-xs" : ""} ${isBlank ? "border-error-500 dark:border-error-500" : ""}`}
              id={`body-${blockIndex}`}
              onChange={(event) => updateText(blockIndex, event.target.value)}
              rows={block.type === "heading" ? 1 : block.type === "code" ? 7 : 5}
              value={text}
            />
            {isBlank && <p className="mt-1.5 text-theme-xs text-error-600 dark:text-error-500">英文が空です</p>}
          </div>
        )
      })}
    </>
  )
}
