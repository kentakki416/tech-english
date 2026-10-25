"use client"

import Link from "next/link"
import { type FormEvent, startTransition, useActionState, useState } from "react"

import type { CreateUrlImportResponse, PreviewUrlImportResponse } from "@repo/api-schema"

import {
  createUrlImportAction,
  previewUrlImportAction,
  type UrlImportFailure,
  type UrlImportState,
} from "@/app/(dashboard)/url-import/actions"
import ComponentCard from "@/components/layout/ComponentCard"
import Badge from "@/components/ui/badge/Badge"
import { tableHeadCellClass } from "@/components/ui/table/LinkTableParts"
import { PASSAGE_STATUS_LABELS } from "@/features/passage/passage.labels"
import { formatLicenseLabel } from "@/features/source/source.labels"
import { SOURCE_CREATE_PATHS } from "@/features/source/source.paths"
import {
  CHUNK_REJECT_REASON_LABELS,
  isImportableChunk,
  URL_IMPORT_CHUNK_STATUS_LABELS,
} from "@/features/url-import/url-import.labels"
import { hintClass, inputClass, labelClass, primaryButtonClass } from "@/libs/ui-classes"

const INITIAL_STATE: UrlImportState = { status: "idle" }

type UrlImportIntent = "create" | "preview"

const bodyCellClass = "px-5 py-4 align-top text-theme-sm text-gray-700 dark:text-gray-300"

/**
 * 確認と保存のどちらも 1 つの状態に書く（保存の結果を出したら確認の結果は消える）。form の hidden の intent で Server Action を選ぶ
 */
const dispatchUrlImportAction = async (state: UrlImportState, formData: FormData): Promise<UrlImportState> =>
  formData.get("intent") === "create"
    ? createUrlImportAction(state, formData)
    : previewUrlImportAction(state, formData)

const errorLinkClass = "mt-2 inline-block text-brand-500 hover:text-brand-600"

function ErrorMessage({ failure }: { failure: UrlImportFailure }) {
  return (
    <div className="rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
      <p className="font-medium text-gray-800 dark:text-white/90">{failure.message}</p>
      {failure.errorCode === "source_not_found" && <Link className={errorLinkClass} href={SOURCE_CREATE_PATHS.website}>ソースを登録する</Link>}
      {failure.errorCode === "out_of_target_path" && <Link className={errorLinkClass} href="/sources">ソースの一覧を開く</Link>}
    </div>
  )
}

function PreviewResult({ isPending, isSaving, preview, saveFailure, url, onSubmit }: {
  isPending: boolean
  isSaving: boolean
  preview: PreviewUrlImportResponse
  saveFailure: UrlImportFailure | null
  url: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const hasImportableChunk = preview.chunks.some(isImportableChunk)
  return (
    <ComponentCard desc="保存するまで DB には書きません。保存のときは確認した内容を保存します（ページを取得してから 10 分を過ぎたら取り直します）。" title="確認の結果">
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">ソース</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">
            {preview.source.name}
            <span className="ml-2 text-theme-xs font-normal text-gray-500 dark:text-gray-400">{formatLicenseLabel(preview.source.license_spdx)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">ページ</dt>
          <dd className="mt-1 font-medium text-gray-800 dark:text-white/90">{preview.page.title}</dd>
          <dd className="mt-0.5 font-mono text-theme-xs break-all text-gray-400">{preview.page.url}</dd>
          <dd className="mt-0.5 text-theme-xs text-gray-500 dark:text-gray-400">{preview.page.word_count} 語</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="min-w-full">
          <thead className="border-b border-gray-100 dark:border-gray-800">
            <tr>
              <th className={tableHeadCellClass} scope="col">見出し</th>
              <th className={tableHeadCellClass} scope="col">英単語数</th>
              <th className={tableHeadCellClass} scope="col">保存したときにどうなるか</th>
              <th className={tableHeadCellClass} scope="col">冒頭の文</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {preview.chunks.map((chunk, index) => {
              const statusLabel = URL_IMPORT_CHUNK_STATUS_LABELS[chunk.status]
              return (
                <tr key={`${index}-${chunk.title}`}>
                  <td className={`${bodyCellClass} font-medium text-gray-800 dark:text-white/90`}>{chunk.title}</td>
                  <td className={`${bodyCellClass} tabular-nums`}>{chunk.word_count}</td>
                  <td className={bodyCellClass}>
                    <Badge color={statusLabel.color} size="sm">
                      {chunk.status === "duplicated" && chunk.same_content_passage
                        ? `${statusLabel.label}（${PASSAGE_STATUS_LABELS[chunk.same_content_passage.status]}）`
                        : statusLabel.label}
                    </Badge>
                    {(chunk.status === "existing" || chunk.status === "duplicated") && chunk.same_content_passage && (
                      <p className="mt-1">
                        <Link
                          className="text-theme-xs whitespace-nowrap text-brand-500 hover:text-brand-600"
                          href={`/passages/${chunk.same_content_passage.id}`}
                        >
                          本文候補を開く
                        </Link>
                      </p>
                    )}
                    {chunk.reject_reasons.length > 0 && (
                      <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
                        {chunk.reject_reasons.map((reason) => CHUNK_REJECT_REASON_LABELS[reason]).join("・")}
                      </p>
                    )}
                  </td>
                  <td className={`${bodyCellClass} max-w-md text-gray-500 dark:text-gray-400`}>{chunk.excerpt}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {saveFailure && <ErrorMessage failure={saveFailure} />}
      <form className="flex flex-wrap items-center gap-3" onSubmit={onSubmit}>
        <input name="intent" type="hidden" value="create" />
        <input name="url" type="hidden" value={url} />
        <button className={primaryButtonClass} disabled={isPending || !hasImportableChunk} type="submit">
          {isSaving ? "保存しています…" : "本文候補として保存"}
        </button>
        {!hasImportableChunk && <p className={hintClass}>本文候補になる塊がありません。</p>}
      </form>
    </ComponentCard>
  )
}

/**
 * 確認の後にページが変わった・本文候補の生成が始まったなどで、保存の時点で優先した本文候補が無いことがある
 */
function ImportResult({ result }: { result: CreateUrlImportResponse }) {
  const hasPrioritizedPassage = result.passages.length > 0
  return (
    <ComponentCard
      desc={hasPrioritizedPassage
        ? "次の問題の生成で、ほかの本文候補より先に生成します。確認待ちの下書きが多いあいだは生成しません。"
        : "優先した本文候補はありません。確認の後に、ページか本文候補の状態が変わりました。"}
      title="保存しました"
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">
        本文候補を {result.created_count} 件作りました。前の切り分けの本文候補を {result.rejected_count} 件却下しました。
      </p>
      {hasPrioritizedPassage && (
        <ul className="space-y-2 text-sm">
          {result.passages.map((passage) => (
            <li key={passage.id} className="flex items-center gap-2">
              <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={`/passages/${passage.id}`}>
                {passage.title}
              </Link>
              {passage.is_new && <Badge color="success" size="sm">新規</Badge>}
            </li>
          ))}
        </ul>
      )}
    </ComponentCard>
  )
}

/**
 * URL を入れて確認し、本文候補として保存する
 */
export function UrlImportForm() {
  const [state, formAction, isPending] = useActionState(dispatchUrlImportAction, INITIAL_STATE)
  const [submittedIntent, setSubmittedIntent] = useState<UrlImportIntent>("preview")

  /**
   * `<form action>` に渡すと、React が送信後にフォームをリセットして入れた URL が消える。送信は onSubmit から Server Action を呼ぶ
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSubmittedIntent(formData.get("intent") === "create" ? "create" : "preview")
    startTransition(() => formAction(formData))
  }

  return (
    <div className="space-y-6">
      <ComponentCard
        desc="登録済みのサイトのソースの、対象パスに合うページの URL を入れます。入れたページの 1 つだけを取り込みます。"
        title="URL から追加"
      >
        <div>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate onSubmit={handleSubmit}>
            <input name="intent" type="hidden" value="preview" />
            <div className="flex-1">
              <label className={labelClass} htmlFor="url-import-url">ページの URL</label>
              <input
                className={inputClass}
                id="url-import-url"
                name="url"
                placeholder="https://go.dev/doc/tutorial/getting-started"
                type="url"
              />
            </div>
            <button className={`${primaryButtonClass} whitespace-nowrap`} disabled={isPending} type="submit">
              {isPending && submittedIntent === "preview" ? "確認しています…" : "確認する"}
            </button>
          </form>
          <p className={hintClass}>クエリ文字列と #... は除いて取得します。取得は 15 秒で打ち切ります。</p>
        </div>
      </ComponentCard>

      {state.status === "error" && <ErrorMessage failure={state} />}
      {state.status === "previewed" && (
        <PreviewResult
          isPending={isPending}
          isSaving={isPending && submittedIntent === "create"}
          preview={state.preview}
          saveFailure={state.saveFailure}
          url={state.url}
          onSubmit={handleSubmit}
        />
      )}
      {state.status === "imported" && <ImportResult result={state.result} />}
    </div>
  )
}
