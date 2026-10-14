"use client"

import type { Dispatch, SetStateAction } from "react"

import type { GetAdminPassageResponse } from "@repo/api-schema"

import { formatBlockLabel, type PassageErrorMarks, type PassageForm } from "@/features/passage/passage.form"
import { labelClass, textareaClass } from "@/libs/ui-classes"

/**
 * 和訳タブ。コード以外の全ブロックの英文（2 行まで）と和訳のテキストエリア。公開の 400 で和訳が空と言われたブロックは error の枠
 */
export function TranslationsTab({
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
  const updateTranslation = (blockIndex: number, translationJa: string) =>
    onChange((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) => (index === blockIndex ? { ...block, translationJa } : block)),
    }))

  return (
    <>
      <p className="text-theme-sm text-gray-500 dark:text-gray-400">コード以外のすべてのブロックに和訳が必要です。カタカナ語・英語のまま使うのが一般的な用語は無理に訳しません。</p>
      {blocks.map((block, blockIndex) => {
        if (block.type === "code") return null
        const formBlock = form.blocks[blockIndex]
        const isMissing = marks.translationBlockIndexes.includes(blockIndex) && !formBlock?.translationJa?.trim()
        return (
          <div key={blockIndex}>
            <label className={labelClass} htmlFor={`translation-${blockIndex}`}>{formatBlockLabel(blocks, blockIndex)}</label>
            <p className="mb-2 line-clamp-2 text-theme-xs text-gray-400">{formBlock?.text}</p>
            <textarea
              className={`${textareaClass} ${isMissing ? "border-error-500 dark:border-error-500" : ""}`}
              id={`translation-${blockIndex}`}
              onChange={(event) => updateTranslation(blockIndex, event.target.value)}
              placeholder="和訳を入力"
              rows={block.type === "heading" ? 1 : 4}
              value={formBlock?.translationJa ?? ""}
            />
            {isMissing && <p className="mt-1.5 text-theme-xs text-error-600 dark:text-error-500">和訳が空です</p>}
          </div>
        )
      })}
    </>
  )
}
