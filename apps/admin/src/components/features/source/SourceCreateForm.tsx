"use client"

import Link from "next/link"
import { type FormEvent, Fragment, type KeyboardEvent, startTransition, useActionState, useState } from "react"

import type { GetSourceResponse, GetTagListResponse, SuggestSourceResponse } from "@repo/api-schema"

import { createSourceAction, type SourceFormState } from "@/app/(dashboard)/sources/actions"
import {
  CollectionToggle,
  Field,
  GitHubBranchField,
  GitHubTargetFields,
  LicenseFields,
  Section,
  SourceKindField,
  WebsiteTargetFields,
} from "@/components/features/source/SourceFormParts"
import { SourceSuggestionSummary } from "@/components/features/source/SourceSuggestionSummary"
import { TagPicker } from "@/components/features/source/TagPicker"
import { SOURCE_SUGGESTION_FAILURE_MESSAGES, type SourceSuggestionFailureReason } from "@/features/source/source.labels"
import { SOURCE_LIST_PATHS } from "@/features/source/source.paths"
import {
  cardBodyClass,
  cardClass,
  inputClass,
  outlineButtonClass,
  primaryButtonClass,
  titleClass,
} from "@/libs/ui-classes"

type SourceFetchType = GetSourceResponse["source"]["fetch_type"]

type LoadStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { message: string, status: "failed" }

type LoadedSuggestion = { suggestion: SuggestSourceResponse, url: string }

type SuggestionResult =
  | { ok: false, reason: SourceSuggestionFailureReason }
  | { ok: true, suggestion: SuggestSourceResponse }

const detailGroupTitleClass = "text-sm font-medium text-gray-800 dark:text-white/90"

const URL_FIELD_TEXTS: Record<SourceFetchType, { hint: string, placeholder: string }> = {
  github_repository: {
    hint: "GitHub のリポジトリ・ディレクトリ・ファイルの URL。",
    placeholder: "https://github.com/reactjs/react.dev/tree/main/src/content/learn",
  },
  website: {
    hint: "サイトのトップか、取り込みたいページのディレクトリの URL。",
    placeholder: "https://go.dev/doc/",
  },
}

const CHECKLISTS: Record<SourceFetchType, string[]> = {
  github_repository: [
    "自動で入ったライセンスが、ドキュメントの文章に掛かっている（コードだけのライセンスではない）",
    "ライセンスが許可リストにある",
    "対象パスが、問題にしたいドキュメントのディレクトリになっている",
  ],
  website: [
    "ローカルでだけ使う（自分で読むためのページ）",
    "robots.txt で対象パスが許可されている",
    "本文が JavaScript で描画されていない（取得した HTML に本文がある）",
  ],
}

/**
 * 「詳細」の外の欄は表示名だけなので、表示名以外の欄の入力エラーは「詳細」の中にある
 */
const hasDetailFieldErrors = (state: SourceFormState): boolean =>
  Object.entries(state.errors ?? {}).some(([key, messages]) => key !== "name" && (messages?.length ?? 0) > 0)

const isSourceSuggestionFailureReason = (value: unknown): value is SourceSuggestionFailureReason =>
  typeof value === "string" && Object.hasOwn(SOURCE_SUGGESTION_FAILURE_MESSAGES, value)

/**
 * ライセンスを自動で決められたか（許可リストのライセンスで、そのファイルの URL がある）。サイトは常に決まる
 */
const isLicenseResolved = (suggestion: SuggestSourceResponse): boolean =>
  suggestion.fetch_type === "website"
  || (suggestion.detected_license.is_allowed && suggestion.detected_license.license_url !== null)

/**
 * ライセンスの欄の初期値。GitHub の許可リスト外・判定できないライセンスは入れず、ライセンスのファイルの URL だけ入れる
 */
const buildInitialLicense = (suggestion: SuggestSourceResponse): { licenseSpdx: string, licenseUrl: string } => {
  if (suggestion.fetch_type === "website") return { licenseSpdx: suggestion.license_spdx, licenseUrl: suggestion.license_url }
  const { is_allowed: isAllowed, license_spdx: licenseSpdx, license_url: licenseUrl } = suggestion.detected_license
  return { licenseSpdx: isAllowed && licenseSpdx !== null ? licenseSpdx : "", licenseUrl: licenseUrl ?? "" }
}

/**
 * Route Handler の失敗のボディの理由。読めない・知らない値なら failed
 */
const readFailureReason = async (res: Response): Promise<SourceSuggestionFailureReason> => {
  const body = (await res.json().catch(() => null)) as { reason?: unknown } | null
  return isSourceSuggestionFailureReason(body?.reason) ? body.reason : "failed"
}

/**
 * 401 は proxy（セッション切れで refresh もできない）が Route Handler より先に返すことがあり、そのボディには reason が無いので status で見分ける
 */
const fetchSourceSuggestion = async (fetchType: SourceFetchType, url: string): Promise<SuggestionResult> => {
  const params = new URLSearchParams({ fetch_type: fetchType, url })
  const res = await fetch(`/api/sources/suggestion?${params.toString()}`)
  if (res.status === 401) return { ok: false, reason: "unauthorized" }
  if (!res.ok) return { ok: false, reason: await readFailureReason(res) }
  /**
   * Route Handler が @repo/api-schema のスキーマで検証済み
   */
  return { ok: true, suggestion: (await res.json()) as SuggestSourceResponse }
}

/**
 * リポジトリ・サイトの URL は読み込んだ値を送る（「詳細」でも直せない。変えるときは URL を読み込み直す）
 */
function SuggestionHiddenField({ suggestion }: { suggestion: SuggestSourceResponse }) {
  return suggestion.fetch_type === "github_repository"
    ? <input name="repository" type="hidden" value={suggestion.repository} />
    : <input name="site_url" type="hidden" value={suggestion.site_url} />
}

/**
 * ソースの登録フォーム。表示名と URL を読み込み、自動で決めた値を見て登録する。直すときは「詳細」を開く。
 * 取得方法（fetchType）は登録の画面（GitHub / サイト）で決まる。読み込んだ値は初期値で、登録の検証は Server Action と api が行う。
 *
 * allowedLicenses はライセンス欄の選択肢（@repo/api-schema の許可リスト）、personalUseLicense はサイトのソースだけが選べる個人の学習用の値。
 * Client Component で Zod のスキーマを import すると bundle に入るため、Server Component から渡す
 */
export function SourceCreateForm({
  allowedLicenses,
  fetchType,
  personalUseLicense,
  tags,
}: {
  allowedLicenses: readonly string[]
  fetchType: SourceFetchType
  personalUseLicense: string
  tags: GetTagListResponse["tags"]
}) {
  const [state, formAction, isPending] = useActionState<SourceFormState, FormData>(createSourceAction, {})
  const [prevState, setPrevState] = useState(state)
  const [url, setUrl] = useState("")
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ status: "idle" })
  const [loaded, setLoaded] = useState<LoadedSuggestion | null>(null)
  const [revision, setRevision] = useState(0)
  const [submission, setSubmission] = useState<{ revision: number, stateAtSubmit: SourceFormState } | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(true)
  const [licenseSpdx, setLicenseSpdx] = useState("")
  const [licenseUrl, setLicenseUrl] = useState("")

  /**
   * 入力エラーが「詳細」の欄にあれば開く。useActionState の state が変わったときだけ判定する（描画中に前の値と比べる）
   */
  if (state !== prevState) {
    setPrevState(state)
    if (hasDetailFieldErrors(state)) setIsDetailsOpen(true)
  }

  const suggestion = loaded?.suggestion ?? null
  const isLoadedUrl = loaded !== null && loaded.url === url.trim()
  const licenseOptions = fetchType === "website" ? [...allowedLicenses, personalUseLicense] : allowedLicenses
  const urlFieldTexts = URL_FIELD_TEXTS[fetchType]
  /**
   * 登録の結果（入力エラー・重複など）は、いま読み込んでいる内容で送った結果だけを出す。
   * 読み込み直したら前の結果は合わず、送り直している間の state は前の送信の結果のままなので、どちらも出さない
   */
  const formState: SourceFormState = submission?.revision === revision && state !== submission.stateAtSubmit ? state : {}
  const getFieldError = (key: string): string | undefined => formState.errors?.[key]?.[0]
  const hasFieldErrors = Object.values(formState.errors ?? {}).some((messages) => (messages?.length ?? 0) > 0)

  /**
   * 読み込みに失敗しても前に読み込んだ内容は消さない（URL の欄が違うので、そのままでは登録できない）。
   * 読み込み直すと、取得元の欄は key を変えて作り直し、ライセンスの欄は読み込んだ値に置き換える。開いている「詳細」は閉じない
   */
  const loadSuggestion = async () => {
    const target = url.trim()
    if (target === "") {
      setLoadStatus({ message: SOURCE_SUGGESTION_FAILURE_MESSAGES.invalid_url, status: "failed" })
      return
    }

    setLoadStatus({ status: "loading" })
    try {
      const result = await fetchSourceSuggestion(fetchType, target)
      if (!result.ok) {
        setLoadStatus({ message: SOURCE_SUGGESTION_FAILURE_MESSAGES[result.reason], status: "failed" })
        return
      }
      const initialLicense = buildInitialLicense(result.suggestion)
      setLoaded({ suggestion: result.suggestion, url: target })
      setRevision((value) => value + 1)
      setLicenseSpdx(initialLicense.licenseSpdx)
      setLicenseUrl(initialLicense.licenseUrl)
      setIsDetailsOpen((isOpen) => isOpen || !isLicenseResolved(result.suggestion))
      setLoadStatus({ status: "idle" })
    } catch {
      setLoadStatus({ message: SOURCE_SUGGESTION_FAILURE_MESSAGES.failed, status: "failed" })
    }
  }

  /**
   * Enter でフォームを送信せずに読み込む
   */
  const handleUrlKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    if (loadStatus.status !== "loading") void loadSuggestion()
  }

  /**
   * `<form action>` に渡すと、React が送信後にフォームをリセットして入力エラーのときに値が消える。送信は onSubmit から Server Action を呼ぶ
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isLoadedUrl) return
    const formData = new FormData(event.currentTarget)
    setSubmission({ revision, stateAtSubmit: state })
    startTransition(() => formAction(formData))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <form className="space-y-6 xl:col-span-2" noValidate onSubmit={handleSubmit}>
        <input name="fetch_type" type="hidden" value={fetchType} />
        {suggestion && <SuggestionHiddenField suggestion={suggestion} />}
        {fetchType === "github_repository" && <input name="is_enabled" type="hidden" value={String(isEnabled)} />}

        {formState.message && (
          <div className="rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
            <p className="font-medium text-gray-800 dark:text-white/90">{formState.message}</p>
          </div>
        )}

        <Section
          desc={fetchType === "website"
            ? "表示名と URL を入れて読み込むと、サイトの URL・対象パス・ライセンスを自動で決めます。"
            : "表示名と URL を入れて読み込むと、リポジトリ・ブランチ・対象パス・ライセンスを自動で決めます。"}
          title="ソース"
        >
          <Field error={getFieldError("name")} htmlFor="name" label="表示名">
            <input className={inputClass} id="name" name="name" placeholder="例：React 公式ドキュメント" />
          </Field>
          <Field
            error={loadStatus.status === "failed" ? loadStatus.message : undefined}
            hint={urlFieldTexts.hint}
            htmlFor="source-url"
            label="URL"
          >
            <div className="flex gap-2">
              <input
                className={`${inputClass} font-mono`}
                id="source-url"
                placeholder={urlFieldTexts.placeholder}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={handleUrlKeyDown}
              />
              <button className={`${outlineButtonClass} shrink-0`} disabled={loadStatus.status === "loading"} type="button" onClick={loadSuggestion}>
                {loadStatus.status === "loading" ? "読み込んでいます…" : "読み込む"}
              </button>
            </div>
          </Field>
          {suggestion && <SourceSuggestionSummary suggestion={suggestion} />}
        </Section>

        {suggestion && (
          <details className={cardClass} open={isDetailsOpen} onToggle={(event) => setIsDetailsOpen(event.currentTarget.open)}>
            <summary className={`cursor-pointer px-6 py-5 ${titleClass}`}>詳細</summary>
            <div className={`${cardBodyClass} space-y-8`}>
              <div className="space-y-5">
                <SourceKindField defaultKind="docs" error={getFieldError("kind")} />
                <Field error={getFieldError("tag_ids")} hint="ユーザーの問題一覧の絞り込みに使います。タグはタグの画面で登録します。" label="技術タグ" labelId="source-tags-label">
                  <TagPicker defaultSelectedIds={[]} tags={tags} />
                </Field>
              </div>
              <div className="space-y-5">
                <h4 className={detailGroupTitleClass}>取得元</h4>
                {suggestion.fetch_type === "github_repository" ? (
                  <Fragment key={revision}>
                    <GitHubBranchField defaultBranch={suggestion.branch} error={getFieldError("branch")} />
                    <GitHubTargetFields
                      defaults={{
                        excludeGlobs: [],
                        includeGlobs: suggestion.include_globs,
                        publicUrlStripPrefix: null,
                        publicUrlTemplate: null,
                      }}
                      getFieldError={getFieldError}
                    />
                  </Fragment>
                ) : (
                  <WebsiteTargetFields
                    key={revision}
                    defaults={{ contentSelector: null, excludeGlobs: [], excludeSelectors: [], includeGlobs: suggestion.include_globs }}
                    getFieldError={getFieldError}
                  />
                )}
              </div>
              <div className="space-y-5">
                <h4 className={detailGroupTitleClass}>ライセンス</h4>
                <LicenseFields
                  fetchType={suggestion.fetch_type}
                  getFieldError={getFieldError}
                  licenseOptions={licenseOptions}
                  licenseSpdx={licenseSpdx}
                  licenseUrl={licenseUrl}
                  onLicenseSpdxChange={setLicenseSpdx}
                  onLicenseUrlChange={setLicenseUrl}
                />
              </div>
              {suggestion.fetch_type === "github_repository" && (
                <div className="space-y-5">
                  <h4 className={detailGroupTitleClass}>収集</h4>
                  <CollectionToggle isEnabled={isEnabled} onToggle={() => setIsEnabled((value) => !value)} />
                </div>
              )}
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasFieldErrors && <p className="mr-auto text-sm text-error-500" role="alert">入力内容を確認してください。各欄の下に理由を表示しています。</p>}
          {!hasFieldErrors && !isLoadedUrl && <p className="mr-auto text-sm text-gray-500 dark:text-gray-400">URL を読み込んでください。</p>}
          <Link className={outlineButtonClass} href={SOURCE_LIST_PATHS[fetchType]}>キャンセル</Link>
          <button className={primaryButtonClass} disabled={!isLoadedUrl || isPending} type="submit">登録する</button>
        </div>
      </form>

      <aside className="space-y-6">
        <section className={cardClass}>
          <div className="px-6 py-5">
            <h3 className={titleClass}>登録の前に確認すること</h3>
          </div>
          <ul className={`${cardBodyClass} list-disc space-y-2 pl-10 text-sm text-gray-600 dark:text-gray-300`}>
            {CHECKLISTS[fetchType].map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </aside>
    </div>
  )
}
