"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { startTransition, useActionState, useMemo, useState } from "react"

import type { GetAdminPassageResponse } from "@repo/api-schema"

import {
  type PassageActionFailure,
  publishPassageAction,
  regeneratePassageAction,
  rejectPassageAction,
  savePassageAction,
  unpublishPassageAction,
} from "@/app/(dashboard)/passages/[id]/actions"
import Badge from "@/components/ui/badge/Badge"
import { Modal } from "@/components/ui/modal"
import {
  convertDetailsToMarks,
  convertDetailToForm,
  convertFormToRequest,
  formatSeconds,
  listFormProblems,
  type PassageErrorMarks,
  type PassageForm,
} from "@/features/passage/passage.form"
import { PASSAGE_STATUS_BADGE_COLORS, PASSAGE_STATUS_LABELS } from "@/features/passage/passage.labels"
import { formatDateTime } from "@/libs/format-date"
import {
  cardClass,
  dangerOutlineButtonClass,
  labelClass,
  outlineButtonClass,
  primaryButtonClass,
  textareaClass,
  titleClass,
} from "@/libs/ui-classes"

import { BasicsTab } from "./BasicsTab"
import { BodyTab } from "./BodyTab"
import { GlossaryTab } from "./GlossaryTab"
import { PassagePreview, type PreviewBlock } from "./PassagePreview"
import { QuestionsTab } from "./QuestionsTab"
import { TranslationsTab } from "./TranslationsTab"

type TabKey = "basics" | "body" | "glossary" | "questions" | "translations"

/**
 * 直前の操作の結果。error の marks は該当の項目（設問・和訳・語句）に付ける印
 */
type ReviewFeedback =
  | { kind: "saved" }
  | { kind: "error", marks: PassageErrorMarks, messages: string[], title: string }

type ReviewState = { feedback: ReviewFeedback | null }

/**
 * useActionState に渡す操作。保存・公開はリクエストを作ったときのフォームを持つ（エラーの印を付ける項目を決めるため）
 */
type ReviewCommand =
  | { form: PassageForm, type: "save" }
  | { form: PassageForm, isDirty: boolean, type: "publish" }
  | { reason: string, type: "reject" }
  | { type: "regenerate" }
  | { type: "unpublish" }

type SaveOutcome = { detail: GetAdminPassageResponse, ok: true } | { feedback: ReviewFeedback, ok: false }

const SAVE_ERROR_TITLE = "入力内容に誤りがあるため、保存できませんでした"

const EMPTY_MARKS: PassageErrorMarks = {
  evidenceQuestionKeys: [],
  glossaryMessages: {},
  hasTimeLimitError: false,
  hasTitleError: false,
  textBlockIndexes: [],
  translationBlockIndexes: [],
}

const NOTICE_TONE_CLASSES = {
  error: "border-error-500 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15",
  info: "border-blue-light-500 bg-blue-light-50 dark:border-blue-light-500/30 dark:bg-blue-light-500/15",
  warning: "border-warning-500 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15",
}

const convertFailureToFeedback = (failure: PassageActionFailure, snapshot: PassageForm): ReviewFeedback => ({
  kind: "error",
  marks: convertDetailsToMarks(failure.details ?? [], snapshot),
  messages: (failure.details ?? []).map((detail) => detail.message),
  title: failure.error,
})

/**
 * 検証モデルと食い違う設問を最初に開く（無ければ先頭の設問）
 */
const findInitialQuestionKey = (form: PassageForm): string | null => {
  const mismatch = form.questions.find((question) =>
    question.verification_choice_index !== null && question.verification_choice_index !== question.correct_choice_index)
  return (mismatch ?? form.questions[0])?.clientKey ?? null
}

function Notice({ items, title, tone }: { items: string[], title: string, tone: keyof typeof NOTICE_TONE_CLASSES }) {
  return (
    <div className={`rounded-xl border p-4 text-sm ${NOTICE_TONE_CLASSES[tone]}`} role={tone === "error" ? "alert" : undefined}>
      <p className="font-medium text-gray-800 dark:text-white/90">{title}</p>
      {items.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-gray-600 dark:text-gray-300">
          {items.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      )}
    </div>
  )
}

/**
 * 状態ごとの案内（公開中・却下・失敗・生成待ち・生成中）。下書きの要確認と公開できない理由は別に出す
 */
function StatusNotice({ detail }: { detail: GetAdminPassageResponse }) {
  switch (detail.status) {
  case "published":
    return (
      <Notice
        items={[
          "非公開に戻してから修正してください。",
          ...(detail.attempt_count > 0
            ? [`${detail.attempt_count} 件の挑戦があるため、設問の数の変更と再生成はできません（設問文・選択肢・正解・解説は修正できます）。`]
            : []),
        ]}
        title="公開中の問題は編集できません"
        tone="info"
      />
    )
  case "rejected":
    return (
      <Notice
        items={[`却下の理由：${detail.reject_reason ?? "（記録がありません）"}`, "「再生成」で生成待ちに戻せます。"]}
        title="却下した問題です"
        tone="info"
      />
    )
  case "failed":
    return (
      <Notice
        items={[detail.generation_error ?? "エラーの記録がありません。", "「再生成」で生成待ちに戻せます。"]}
        title="生成に失敗しました"
        tone="error"
      />
    )
  case "collected":
    return <Notice items={["次回の生成タスク（generate:questions）で設問・和訳・用語集が作られます。"]} title="生成待ちです" tone="info" />
  case "generating":
    return <Notice items={["生成タスクが処理しています。完了すると下書きになります。"]} title="生成中です" tone="info" />
  default:
    return null
  }
}

/**
 * 問題の確認・修正。左にユーザーと同じ見た目のプレビュー（フォームの未保存の修正を含む）、右に設問・和訳・用語集・本文・基本情報のタブ
 */
export function PassageReview({ detail }: { detail: GetAdminPassageResponse }) {
  const router = useRouter()
  const [form, setForm] = useState<PassageForm>(() => convertDetailToForm(detail))
  const [tab, setTab] = useState<TabKey>("questions")
  const [openQuestionKey, setOpenQuestionKey] = useState<string | null>(() => findInitialQuestionKey(convertDetailToForm(detail)))
  const [showGlossary, setShowGlossary] = useState(true)
  const [showAllTranslations, setShowAllTranslations] = useState(false)
  const [translatedBlocks, setTranslatedBlocks] = useState<Set<number>>(new Set())
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  /**
   * 保存・状態の変更の後に詳細が取り直されたら、フォームを新しい詳細に合わせる（追加した設問・語句に id が付く）
   */
  const detailVersion = `${detail.status}:${detail.updated_at}`
  const [syncedVersion, setSyncedVersion] = useState(detailVersion)
  if (syncedVersion !== detailVersion) {
    setSyncedVersion(detailVersion)
    setForm(convertDetailToForm(detail))
  }

  const savedRequestJson = useMemo(() => JSON.stringify(convertFormToRequest(convertDetailToForm(detail))), [detail])
  const isDirty = JSON.stringify(convertFormToRequest(form)) !== savedRequestJson

  const isDraft = detail.status === "draft"
  const isPublished = detail.status === "published"
  const canRegenerate = ["draft", "failed", "rejected"].includes(detail.status) && detail.attempt_count === 0

  /**
   * 画面で見つけられる誤りを先に検査してから保存する
   */
  const saveForm = async (snapshot: PassageForm): Promise<SaveOutcome> => {
    const problems = listFormProblems(snapshot, detail.blocks)
    if (problems.length > 0) {
      return {
        feedback: { kind: "error", marks: convertDetailsToMarks(problems, snapshot), messages: problems.map((problem) => problem.message), title: SAVE_ERROR_TITLE },
        ok: false,
      }
    }
    const result = await savePassageAction(detail.id, convertFormToRequest(snapshot))
    if (!result.ok) return { feedback: convertFailureToFeedback(result, snapshot), ok: false }
    return { detail: result.detail, ok: true }
  }

  /**
   * 状態を変える操作（却下・非公開・再生成）。成功したらダイアログを閉じて詳細を取り直す
   */
  const changeStatus = async (execute: () => Promise<{ ok: true } | PassageActionFailure>): Promise<ReviewState> => {
    const result = await execute()
    setIsRejectOpen(false)
    setIsRegenerateOpen(false)
    if (!result.ok) return { feedback: convertFailureToFeedback(result, form) }
    setRejectReason("")
    router.refresh()
    return { feedback: null }
  }

  const runCommand = async (_previous: ReviewState, command: ReviewCommand): Promise<ReviewState> => {
    switch (command.type) {
    case "save": {
      const saved = await saveForm(command.form)
      return { feedback: saved.ok ? { kind: "saved" } : saved.feedback }
    }
    case "publish": {
      /**
       * 未保存の修正があれば先に保存する。公開の 400 の位置は保存後の詳細の並び（語句は本文の位置順に並び直る）
       */
      let snapshot = command.form
      if (command.isDirty) {
        const saved = await saveForm(command.form)
        if (!saved.ok) return { feedback: saved.feedback }
        snapshot = convertDetailToForm(saved.detail)
      }
      const result = await publishPassageAction(detail.id)
      return { feedback: result.ok ? null : convertFailureToFeedback(result, snapshot) }
    }
    case "reject":
      return changeStatus(async () => rejectPassageAction(detail.id, command.reason))
    case "regenerate":
      return changeStatus(async () => regeneratePassageAction(detail.id))
    case "unpublish":
      return changeStatus(async () => unpublishPassageAction(detail.id))
    }
  }

  const [state, dispatch, isPending] = useActionState<ReviewState, ReviewCommand>(runCommand, { feedback: null })
  const feedback = state.feedback
  const marks = feedback?.kind === "error" ? feedback.marks : EMPTY_MARKS

  const runInTransition = (command: ReviewCommand) => startTransition(() => dispatch(command))

  const openQuestion = form.questions.find((question) => question.clientKey === openQuestionKey)
  const highlight = tab === "questions" && openQuestion
    ? { blockIndex: openQuestion.evidence.block_index, quote: openQuestion.evidence.quote }
    : null
  const previewBlocks: PreviewBlock[] = detail.blocks.map((block, index) => ({
    lang: block.lang,
    text: form.blocks[index]?.text ?? block.text,
    translationJa: form.blocks[index]?.translationJa ?? null,
    type: block.type,
  }))
  const vocabularyTargetKeys = form.questions.flatMap((question) =>
    (question.type === "vocabulary" && question.targetGlossaryKey ? [question.targetGlossaryKey] : []))

  const tabs: { key: TabKey, label: string }[] = [
    { key: "questions", label: `設問（${form.questions.length}）` },
    { key: "translations", label: "和訳" },
    { key: "glossary", label: `用語集（${form.glossary.length}）` },
    { key: "body", label: "本文" },
    { key: "basics", label: "基本情報" },
  ]

  const toggleTranslation = (blockIndex: number) =>
    setTranslatedBlocks((value) => {
      const next = new Set(value)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })

  /**
   * 設問を開いたら、プレビューをその根拠のブロックまでスクロールする
   */
  const openQuestionAndShowEvidence = (key: string | null, evidenceBlockIndex?: number) => {
    setOpenQuestionKey(key)
    if (key === null || evidenceBlockIndex === undefined) return
    window.requestAnimationFrame(() =>
      document.getElementById(`preview-block-${evidenceBlockIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }))
  }

  const sourceRecord = [
    { label: "生成モデル", mono: true, value: detail.generation_model },
    { label: "プロンプトの版", mono: true, value: detail.generation_prompt_version },
    { label: "生成日時", mono: false, value: detail.generated_at ? formatDateTime(detail.generated_at) : null },
    { label: "制限時間", mono: false, value: detail.time_limit_seconds === null ? null : formatSeconds(detail.time_limit_seconds) },
  ]

  return (
    <div className="space-y-6">
      <section className={`${cardClass} px-6 py-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={PASSAGE_STATUS_BADGE_COLORS[detail.status]} size="sm">{PASSAGE_STATUS_LABELS[detail.status]}</Badge>
              {isDraft && detail.needs_attention && <Badge color="warning" size="sm">要確認</Badge>}
            </div>
            <h3 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{detail.title}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {isPublished && (
              <button className={outlineButtonClass} disabled={isPending} onClick={() => runInTransition({ type: "unpublish" })} type="button">
                非公開に戻す
              </button>
            )}
            {(isDraft || detail.status === "failed" || detail.status === "rejected") && (
              <button
                className={`${outlineButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                disabled={isPending || !canRegenerate}
                onClick={() => setIsRegenerateOpen(true)}
                title={detail.attempt_count > 0 ? "挑戦がある問題は再生成できません" : undefined}
                type="button"
              >
                再生成
              </button>
            )}
            {isDraft && (
              <>
                <button className={dangerOutlineButtonClass} disabled={isPending} onClick={() => setIsRejectOpen(true)} type="button">却下</button>
                <button className={outlineButtonClass} disabled={isPending} onClick={() => runInTransition({ form, type: "save" })} type="button">保存</button>
                <button className={primaryButtonClass} disabled={isPending} onClick={() => runInTransition({ form, isDirty, type: "publish" })} type="button">
                  公開する
                </button>
              </>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-100 pt-4 text-theme-sm sm:grid-cols-4 dark:border-gray-800">
          <div>
            <dt className="text-gray-400">ソース</dt>
            <dd className="mt-0.5 text-gray-800 dark:text-white/90">{detail.source.name}</dd>
          </div>
          <div className="col-span-2 min-w-0">
            <dt className="text-gray-400">取得元</dt>
            <dd className="mt-0.5 truncate font-mono text-theme-xs text-gray-800 dark:text-white/90" title={detail.source.path}>
              {detail.source.path}
              {detail.source.commit_sha && <span className="ml-2 text-gray-400">@{detail.source.commit_sha.slice(0, 7)}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">英単語数</dt>
            <dd className="mt-0.5 text-gray-800 tabular-nums dark:text-white/90">{detail.word_count} 語</dd>
          </div>
          {sourceRecord.map((item) => (
            <div key={item.label}>
              <dt className="text-gray-400">{item.label}</dt>
              <dd className={`mt-0.5 text-gray-800 dark:text-white/90 ${item.mono ? "font-mono text-theme-xs" : "tabular-nums"}`}>{item.value ?? "―"}</dd>
            </div>
          ))}
        </dl>
        {isPending && <p className="mt-3 text-theme-sm text-gray-500 dark:text-gray-400" role="status">処理しています…</p>}
        {!isPending && feedback?.kind === "saved" && !isDirty && (
          <p className="mt-3 text-theme-sm text-success-600 dark:text-success-500" role="status">下書きを保存しました</p>
        )}
        {!isPending && isDraft && isDirty && (
          <p className="mt-3 text-theme-sm text-gray-500 dark:text-gray-400">未保存の修正があります。「公開する」を押すと、保存してから公開します。</p>
        )}
      </section>

      <StatusNotice detail={detail} />
      {feedback?.kind === "error" && <Notice items={feedback.messages} title={feedback.title} tone="error" />}
      {isDraft && detail.attention_reasons.length > 0 && <Notice items={detail.attention_reasons} title="要確認" tone="warning" />}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={`${cardClass} min-w-0 self-start xl:sticky xl:top-24`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div>
              <h3 className={titleClass}>プレビュー</h3>
              <p className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">ユーザーの解答画面と同じ見た目</p>
            </div>
            <div className="flex flex-wrap gap-4 text-theme-sm text-gray-700 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input checked={showGlossary} className="size-4 accent-brand-500" onChange={(event) => setShowGlossary(event.target.checked)} type="checkbox" />
                用語集の下線
              </label>
              <label className="flex items-center gap-2">
                <input checked={showAllTranslations} className="size-4 accent-brand-500" onChange={(event) => setShowAllTranslations(event.target.checked)} type="checkbox" />
                全文訳
              </label>
            </div>
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto border-t border-gray-100 p-3 dark:border-gray-800">
            <PassagePreview
              blocks={previewBlocks}
              glossary={form.glossary}
              highlight={highlight}
              showAllTranslations={showAllTranslations}
              showGlossary={showGlossary}
              translatedBlocks={translatedBlocks}
              vocabularyTargetKeys={vocabularyTargetKeys}
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
          <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-100 px-4 pt-3 dark:border-gray-800" role="tablist">
            {tabs.map((item) => (
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

          <fieldset className="min-w-0 space-y-4 p-4 sm:p-6" disabled={!isDraft && tab !== "questions"}>
            {tab === "questions" && (
              <QuestionsTab
                attemptCount={detail.attempt_count}
                blocks={detail.blocks}
                form={form}
                isEditable={isDraft}
                marks={marks}
                openQuestionKey={openQuestionKey}
                showVerificationMismatch={!isPublished}
                wordCount={detail.word_count}
                onChange={setForm}
                onOpenQuestionChange={openQuestionAndShowEvidence}
              />
            )}
            {tab === "translations" && <TranslationsTab blocks={detail.blocks} form={form} marks={marks} onChange={setForm} />}
            {tab === "glossary" && <GlossaryTab blocks={detail.blocks} form={form} marks={marks} onChange={setForm} />}
            {tab === "body" && <BodyTab blocks={detail.blocks} form={form} marks={marks} onChange={setForm} />}
            {tab === "basics" && (
              <BasicsTab form={form} formula={detail.time_limit_formula} marks={marks} wordCount={detail.word_count} onChange={setForm} />
            )}
          </fieldset>
        </section>
      </div>

      <div className="flex justify-start">
        <Link className="text-theme-sm text-gray-500 hover:text-gray-700 dark:text-gray-400" href={`/passages?status=${detail.status}`}>問題一覧に戻る</Link>
      </div>

      <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen={isRejectOpen} onClose={() => setIsRejectOpen(false)}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">この問題を却下する</h4>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">却下した問題はユーザーに表示されません。あとから「再生成」で生成待ちに戻せます。</p>
        <label className={`${labelClass} mt-5`} htmlFor="reject-reason">却下の理由（必須）</label>
        <textarea
          className={textareaClass}
          id="reject-reason"
          maxLength={1000}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder="例：コード例が中心で、読解の題材になる文章が短い"
          rows={3}
          value={rejectReason}
        />
        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={() => setIsRejectOpen(false)} type="button">キャンセル</button>
          <button
            className="inline-flex items-center justify-center rounded-lg bg-error-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:bg-error-300"
            disabled={isPending || rejectReason.trim().length === 0}
            onClick={() => runInTransition({ reason: rejectReason, type: "reject" })}
            type="button"
          >
            却下する
          </button>
        </div>
      </Modal>

      <Modal className="m-4 max-w-[520px] p-6 lg:p-8" isOpen={isRegenerateOpen} onClose={() => setIsRegenerateOpen(false)}>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">問題を再生成する</h4>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          生成した設問・和訳・用語集を削除して、生成待ち（収集済み）に戻します。次回の生成タスクで作り直されます。修正した内容も消えます。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button className={outlineButtonClass} onClick={() => setIsRegenerateOpen(false)} type="button">キャンセル</button>
          <button className={primaryButtonClass} disabled={isPending} onClick={() => runInTransition({ type: "regenerate" })} type="button">再生成する</button>
        </div>
      </Modal>
    </div>
  )
}
