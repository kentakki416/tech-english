"use client"

import { type FormEvent, useState, useTransition } from "react"

import type { GetTagListResponse } from "@repo/api-schema"

import { createTagAction, type TagActionResult, updateTagAction } from "@/app/(dashboard)/tags/actions"
import { TAG_COLOR_CLASSES, TagChip, type TagColor } from "@/components/features/tag/TagChip"
import { Modal } from "@/components/ui/modal"
import { hintClass, inputClass, labelClass, outlineButtonClass, primaryButtonClass } from "@/libs/ui-classes"

type TagListItem = GetTagListResponse["tags"][number]

/**
 * 選んでいる色。auto は「自動」（追加のときだけ）
 */
type ColorChoice = TagColor | "auto"

/**
 * タグの追加・編集のモーダル。tag が null なら追加
 */
export function TagFormModal({ colors, onClose, tag }: { colors: readonly TagColor[], onClose: () => void, tag: TagListItem | null }) {
  const [name, setName] = useState(tag?.name ?? "")
  const [color, setColor] = useState<ColorChoice>(tag?.color ?? "auto")
  const [failure, setFailure] = useState<Extract<TagActionResult, { ok: false }> | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = tag
        ? await updateTagAction(tag.id, { color: color === "auto" ? tag.color : color, name })
        : await createTagAction({ color: color === "auto" ? null : color, name })
      if (result.ok) {
        onClose()
        return
      }
      setFailure(result)
    })
  }

  const choices: ColorChoice[] = tag ? [...colors] : ["auto", ...colors]
  const nameError = failure?.errors?.name?.[0]

  return (
    <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen onClose={onClose}>
      <form noValidate onSubmit={handleSubmit}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">{tag ? "タグを編集" : "タグを追加"}</h4>

        {failure?.message && (
          <div className="mt-4 rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
            <p className="font-medium text-gray-800 dark:text-white/90">{failure.message}</p>
          </div>
        )}

        <div className="mt-6">
          <label className={labelClass} htmlFor="tag-name">名前</label>
          <input
            aria-invalid={nameError ? true : undefined}
            className={inputClass}
            id="tag-name"
            maxLength={30}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <p className={hintClass}>大文字・小文字だけが違う名前は同じタグとみなします。カンマは使えません。</p>
          {nameError && <p className="mt-1.5 text-xs text-error-500" role="alert">{nameError}</p>}
        </div>

        <div className="mt-6">
          <p className={labelClass} id="tag-color-label">色</p>
          <div aria-labelledby="tag-color-label" className="grid grid-cols-6 gap-2" role="radiogroup">
            {choices.map((choice) => (
              <button
                key={choice}
                aria-checked={color === choice}
                aria-label={choice === "auto" ? "自動" : choice}
                className={`flex h-9 items-center justify-center rounded-lg ring-1 ring-inset transition ${color === choice ? "ring-2 ring-brand-500" : "ring-gray-200 hover:ring-gray-400 dark:ring-gray-700"}`}
                onClick={() => setColor(choice)}
                role="radio"
                type="button"
              >
                {choice === "auto"
                  ? <span className="text-xs font-medium text-gray-600 dark:text-gray-400">自動</span>
                  : <span className={`h-5 w-5 rounded-full ${TAG_COLOR_CLASSES[choice].swatch}`} />}
              </button>
            ))}
          </div>
          <div className="mt-3 flex min-h-7 items-center">
            {color === "auto"
              ? <p className={hintClass}>保存すると色が決まります</p>
              : name.trim() !== "" && <TagChip color={color} name={name.trim()} />}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={onClose} type="button">キャンセル</button>
          <button className={primaryButtonClass} disabled={isPending} type="submit">{isPending ? "保存中…" : tag ? "保存する" : "追加する"}</button>
        </div>
      </form>
    </Modal>
  )
}
