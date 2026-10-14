"use client"

import { type Dispatch, type FormEvent, type SetStateAction, useState } from "react"

import type { GetAdminPassageResponse } from "@repo/api-schema"

import Badge from "@/components/ui/badge/Badge"
import { Modal } from "@/components/ui/modal"
import { type Column, DataTable } from "@/components/ui/table"
import {
  createNewClientKey,
  findSurfaceRange,
  formatBlockLabel,
  joinBlockLabel,
  type PassageErrorMarks,
  type PassageForm,
  type PassageFormGlossaryEntry,
} from "@/features/passage/passage.form"
import { hintClass, inputClass, labelClass, outlineButtonClass, primaryButtonClass, selectClass, textareaClass } from "@/libs/ui-classes"

type DetailBlocks = GetAdminPassageResponse["blocks"]

/**
 * 語句の追加・編集のダイアログの入力値
 */
type GlossaryDraft = {
  blockIndex: number
  lemma: string
  meaningJa: string
  noteJa: string
  partOfSpeech: string
  surface: string
}

/**
 * 表の 1 行。フォームの語句に、表示に使う値を足す
 */
type GlossaryRow = PassageFormGlossaryEntry & {
  blockLabel: string
  errors: string[]
  isVocabularyTarget: boolean
}

/**
 * 開いているダイアログ。entry が null なら追加
 */
type EditingState = { entry: PassageFormGlossaryEntry | null } | null

const errorTextClass = "mt-1 text-theme-xs text-error-600 dark:text-error-500"

/**
 * 語句・見出し語・文脈での意味が入っていれば追加・保存できる（本文に無い語句は保存の API が 400 にする）
 */
const isCompleteDraft = (draft: GlossaryDraft): boolean =>
  draft.surface.trim().length > 0 && draft.lemma.trim().length > 0 && draft.meaningJa.trim().length > 0

const convertEntryToDraft = (entry: PassageFormGlossaryEntry | null, defaultBlockIndex: number): GlossaryDraft => ({
  blockIndex: entry?.block_index ?? defaultBlockIndex,
  lemma: entry?.lemma ?? "",
  meaningJa: entry?.meaning_ja ?? "",
  noteJa: entry?.note_ja ?? "",
  partOfSpeech: entry?.part_of_speech ?? "",
  surface: entry?.surface ?? "",
})

/**
 * 語句の追加・編集のダイアログ（却下のダイアログと同じ枠）。語句は本文と同じ表記で入力する
 */
function GlossaryEntryModal({
  blocks,
  editing,
  form,
  onClose,
  onSubmit,
}: {
  blocks: DetailBlocks
  editing: NonNullable<EditingState>
  form: PassageForm
  onClose: () => void
  onSubmit: (draft: GlossaryDraft) => void
}) {
  const blockOptions = blocks.flatMap((block, index) => (block.type === "code" ? [] : [index]))
  /**
   * 追加のときは最初の段落（見出ししか無ければ見出し）を選んでおく
   */
  const defaultBlockIndex = blockOptions.find((index) => blocks[index]?.type !== "heading") ?? blockOptions[0] ?? 0
  const [draft, setDraft] = useState<GlossaryDraft>(() => convertEntryToDraft(editing.entry, defaultBlockIndex))
  const blockText = form.blocks[draft.blockIndex]?.text ?? ""
  /**
   * 保存時の API と同じ規則（findSurfaceRange。単語の途中の出現は数えない）で探す。"cached" しか無い本文に "cache" は見つからない
   */
  const isSurfaceMissing = draft.surface.length > 0 && findSurfaceRange(blockText, draft.surface) === null

  const updateDraft = (patch: Partial<GlossaryDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCompleteDraft(draft)) onSubmit(draft)
  }

  return (
    <Modal className="m-4 max-w-[560px] p-6 lg:p-8" isOpen onClose={onClose}>
      <form noValidate onSubmit={submit}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">{editing.entry ? "語句を編集" : "語句を追加"}</h4>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">語句は本文と同じ表記で入力します。保存時に本文中の位置を再計算します。</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="glossary-surface">語句（本文の表記）</label>
            <input className={inputClass} id="glossary-surface" onChange={(event) => updateDraft({ surface: event.target.value })} placeholder="例：escape hatch" value={draft.surface} />
          </div>
          <div>
            <label className={labelClass} htmlFor="glossary-block">段落</label>
            <select className={selectClass} id="glossary-block" onChange={(event) => updateDraft({ blockIndex: Number(event.target.value) })} value={draft.blockIndex}>
              {blockOptions.map((blockIndex) => <option key={blockIndex} value={blockIndex}>{formatBlockLabel(blocks, blockIndex)}</option>)}
            </select>
          </div>
          {isSurfaceMissing && (
            <p className="text-theme-xs text-warning-600 sm:col-span-2 dark:text-orange-400">
              {joinBlockLabel(formatBlockLabel(blocks, draft.blockIndex), "の本文に見つかりません（単語の一部としての出現は数えません）。このまま保存するとエラーになります。")}
            </p>
          )}
          <div>
            <label className={labelClass} htmlFor="glossary-lemma">見出し語</label>
            <input className={inputClass} id="glossary-lemma" onChange={(event) => updateDraft({ lemma: event.target.value })} placeholder="例：escape hatch" value={draft.lemma} />
          </div>
          <div>
            <label className={labelClass} htmlFor="glossary-pos">品詞</label>
            <input className={inputClass} id="glossary-pos" onChange={(event) => updateDraft({ partOfSpeech: event.target.value })} placeholder="例：名詞" value={draft.partOfSpeech} />
          </div>
        </div>
        <div className="mt-4">
          <label className={labelClass} htmlFor="glossary-meaning">文脈での意味</label>
          <textarea className={textareaClass} id="glossary-meaning" onChange={(event) => updateDraft({ meaningJa: event.target.value })} rows={2} value={draft.meaningJa} />
        </div>
        <div className="mt-4">
          <label className={labelClass} htmlFor="glossary-note">補足（任意）</label>
          <textarea className={textareaClass} id="glossary-note" onChange={(event) => updateDraft({ noteJa: event.target.value })} rows={2} value={draft.noteJa} />
          <p className={hintClass}>例：技術文書では「〜を無効にする」の意味でよく使う</p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={onClose} type="button">キャンセル</button>
          <button className={primaryButtonClass} disabled={!isCompleteDraft(draft)} type="submit">{editing.entry ? "変更する" : "追加する"}</button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * 用語集タブ。DataTable の行はフォームの語句。保存・公開の 400 の details（["glossary", i, "surface"]、["glossary", i, "meaning_ja"] など）は該当の語句の行に出す。
 * 下書き以外では親の fieldset が操作のボタンを無効にする
 */
export function GlossaryTab({
  blocks,
  form,
  marks,
  onChange,
}: {
  blocks: DetailBlocks
  form: PassageForm
  marks: PassageErrorMarks
  onChange: Dispatch<SetStateAction<PassageForm>>
}) {
  const [editing, setEditing] = useState<EditingState>(null)
  const vocabularyTargetKeys = new Set(form.questions.flatMap((question) => (question.type === "vocabulary" && question.targetGlossaryKey ? [question.targetGlossaryKey] : [])))

  const rows: GlossaryRow[] = form.glossary.map((entry) => ({
    ...entry,
    blockLabel: formatBlockLabel(blocks, entry.block_index),
    errors: marks.glossaryMessages[entry.clientKey] ?? [],
    isVocabularyTarget: vocabularyTargetKeys.has(entry.clientKey),
  }))

  /**
   * 語句を消し、その語句を対象にしていた設問の対象を外す
   */
  const deleteEntry = (clientKey: string) =>
    onChange((current) => ({
      ...current,
      glossary: current.glossary.filter((entry) => entry.clientKey !== clientKey),
      questions: current.questions.map((question) => (question.targetGlossaryKey === clientKey ? { ...question, targetGlossaryKey: null } : question)),
    }))

  const saveDraft = (draft: GlossaryDraft) => {
    const editingEntry = editing?.entry ?? null
    onChange((current) => {
      const values = {
        block_index: draft.blockIndex,
        lemma: draft.lemma.trim(),
        meaning_ja: draft.meaningJa.trim(),
        note_ja: draft.noteJa.trim() || null,
        part_of_speech: draft.partOfSpeech.trim() || null,
        surface: draft.surface,
      }
      if (editingEntry) {
        /**
         * 語句か段落を変えたら、保存済みの位置はもう指していないので捨てる（プレビューは保存時と同じ規則で探し直す）
         */
        const isMoved = values.surface !== editingEntry.surface || values.block_index !== editingEntry.block_index
        return {
          ...current,
          glossary: current.glossary.map((entry) => (entry.clientKey === editingEntry.clientKey
            ? { ...entry, ...values, ...(isMoved ? { end_offset: null, start_offset: null } : {}) }
            : entry)),
        }
      }
      const clientKey = createNewClientKey(current.glossary.map((entry) => entry.clientKey))
      return { ...current, glossary: [...current.glossary, { id: null, ...values, clientKey, end_offset: null, start_offset: null }] }
    })
    setEditing(null)
  }

  const columns: Column<GlossaryRow>[] = [
    {
      className: "w-44 px-5 py-4 text-theme-sm",
      header: "語句",
      render: (row) => (
        <div>
          <p className="font-medium text-gray-800 dark:text-white/90">{row.surface}</p>
          <p className="text-theme-xs text-gray-400">
            {row.lemma !== row.surface.toLowerCase() && <span className="mr-1.5">{row.lemma}</span>}
            {row.part_of_speech}
            <span className="ml-1.5">{row.blockLabel}</span>
          </p>
          {row.isVocabularyTarget && <span className="mt-1 inline-block whitespace-nowrap"><Badge color="info" size="sm">語義設問の対象</Badge></span>}
          {row.errors.map((message, index) => <p key={index} className={errorTextClass}>{message}</p>)}
        </div>
      ),
    },
    {
      className: "px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300",
      header: "文脈での意味",
      render: (row) => (
        <div>
          {row.meaning_ja}
          {row.note_ja && <p className="mt-0.5 text-theme-xs text-gray-400">{row.note_ja}</p>}
        </div>
      ),
    },
    {
      className: "px-5 py-4 text-right text-theme-sm whitespace-nowrap",
      header: "",
      render: (row) => (
        <>
          <button className="mr-3 text-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:text-gray-400" onClick={() => setEditing({ entry: row })} type="button">編集</button>
          <button
            className="text-error-600 hover:text-error-700 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-error-500"
            onClick={() => deleteEntry(row.clientKey)}
            type="button"
          >
            削除
          </button>
        </>
      ),
    },
  ]

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">語句は本文と同じ表記で登録します。保存時に本文中の位置を再計算します。</p>
        <button className={`${outlineButtonClass} shrink-0`} onClick={() => setEditing({ entry: null })} type="button">語句を追加</button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          <DataTable
            columns={columns}
            data={rows}
            emptyMessage={<p className="text-sm text-gray-500 dark:text-gray-400">用語集はまだありません。</p>}
            getRowKey={(row) => row.clientKey}
          />
        </div>
      </div>
      {editing && <GlossaryEntryModal blocks={blocks} editing={editing} form={form} onClose={() => setEditing(null)} onSubmit={saveDraft} />}
    </>
  )
}
