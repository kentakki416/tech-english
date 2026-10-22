"use client"

import Link from "next/link"
import { type FormEvent, startTransition, useActionState, useRef, useState } from "react"

import type { DetectSourceLicenseResponse, GetSourceResponse, GetTagListResponse } from "@repo/api-schema"

import {
  createSourceAction,
  type SourceFormState,
  updateSourceAction,
} from "@/app/(dashboard)/sources/actions"
import { TagPicker } from "@/components/features/source/TagPicker"
import Badge from "@/components/ui/badge/Badge"
import { formatDateTime } from "@/libs/date"
import { isLocalEnvironment } from "@/libs/environment"
import {
  cardBodyClass,
  cardClass,
  descClass,
  hintClass,
  inputClass,
  labelClass,
  outlineButtonClass,
  primaryButtonClass,
  selectClass,
  textareaClass,
  titleClass,
} from "@/libs/ui-classes"

type FetchType = GetSourceResponse["source"]["fetch_type"]

type Discovery = "sitemap" | "start"

/**
 * 「ライセンスを検出」の状態
 */
type LicenseDetection =
  | { status: "idle" }
  | { status: "detecting" }
  | { result: DetectSourceLicenseResponse, status: "detected" }
  | { message: string, status: "failed" }

const FETCH_TYPE_OPTIONS: { description: string, key: FetchType, label: string }[] = [
  { description: "README・RFC・docs ディレクトリ、GitHub に Markdown のソースがある公式ドキュメント", key: "github_repository", label: "GitHub リポジトリ" },
  { description: "ローカルだけ。URL から追加でページを取り込むためのサイト（収集はしない）", key: "website", label: "サイト（URL から追加）" },
]

/**
 * サイトのソースはローカルでだけ登録できる
 */
const AVAILABLE_FETCH_TYPE_OPTIONS = FETCH_TYPE_OPTIONS.filter((option) => isLocalEnvironment || option.key !== "website")

const LICENSE_NOTE = "コードとドキュメントでライセンスが分かれているリポジトリでは、GitHub の検出はコードのライセンスのことがあります。ドキュメントの文章に掛かっているライセンスと、それが書かれたリポジトリの中のファイルを選んでください。"

const PERSONAL_USE_LICENSE_LABEL = "個人の学習用（ライセンスなし）"

const errorHintClass = "mt-1.5 text-xs text-error-500"

/**
 * 公開ページの URL 規則の変換例に使うファイルパス（取り除くプレフィックスと拡張子を除いたもの）
 */
const SAMPLE_PAGE_PATH = "learn/getting-started"

/**
 * 保存済みの URL 規則で、ファイルパスがどの URL になるかの例
 */
const buildPublicUrlExample = (template: string, stripPrefix: string | null): string =>
  `例：${stripPrefix ?? ""}${SAMPLE_PAGE_PATH}.md → ${template.replace("{path}", SAMPLE_PAGE_PATH)}`

function Section({ children, desc, title }: { children: React.ReactNode, desc?: string, title: string }) {
  return (
    <section className={cardClass}>
      <div className="px-6 py-5">
        <h3 className={titleClass}>{title}</h3>
        {desc && <p className={descClass}>{desc}</p>}
      </div>
      <div className={`${cardBodyClass} space-y-5`}>{children}</div>
    </section>
  )
}

function Field({
  children,
  error,
  hint,
  htmlFor,
  label,
  labelId,
}: {
  children: React.ReactNode
  error?: string
  hint?: string
  htmlFor?: string
  label: string
  labelId?: string
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={htmlFor} id={labelId}>{label}</label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
      {error && <p className={errorHintClass}>{error}</p>}
    </div>
  )
}

/**
 * 「ライセンスを検出」の結果の表示。検出できない・許可リスト外のときはその旨を足す
 */
function LicenseDetectionMessage({ detection }: { detection: LicenseDetection }) {
  if (detection.status === "failed") return <p className={errorHintClass}>{detection.message}</p>
  if (detection.status !== "detected") return null

  const { is_allowed: isAllowed, license_spdx: licenseSpdx, license_url: licenseUrl } = detection.result
  const licenseFileName = licenseUrl?.split("/").at(-1) ?? null
  return (
    <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-theme-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
      {licenseSpdx === null ? (
        <span className="font-medium">
          {licenseFileName === null ? "ライセンスのファイルが見つかりませんでした" : "ライセンスの種類を判定できませんでした"}
        </span>
      ) : (
        <>
          GitHub が検出したライセンス：<span className="font-medium">{licenseSpdx}</span>
          {!isAllowed && <span className="font-medium text-error-600 dark:text-error-500">（許可リストにないため登録できません）</span>}
        </>
      )}
      {licenseFileName !== null && <>（ライセンスのファイル：<span className="font-mono">{licenseFileName}</span>）</>}
      。{LICENSE_NOTE}
    </p>
  )
}

/**
 * ソースの登録・編集フォーム。detail が null なら登録、あれば編集（取得方法は変更不可）
 *
 * allowedLicenses はライセンス欄の選択肢（@repo/api-schema の許可リスト）、personalUseLicense はサイトのソースだけが選べる個人の学習用の値。
 * Client Component で Zod のスキーマを import すると bundle に入るため、Server Component から渡す
 */
export function SourceForm({
  allowedLicenses,
  detail,
  personalUseLicense,
  tags,
}: {
  allowedLicenses: readonly string[]
  detail: GetSourceResponse | null
  personalUseLicense: string
  tags: GetTagListResponse["tags"]
}) {
  const source = detail?.source ?? null
  const githubSource = source?.fetch_type === "github_repository" ? source : null
  const websiteSource = source?.fetch_type === "website" ? source : null
  const isEdit = source !== null

  const action = source ? updateSourceAction.bind(null, source.id) : createSourceAction
  const [state, formAction, isPending] = useActionState<SourceFormState, FormData>(action, {})

  const [fetchType, setFetchType] = useState<FetchType>(source?.fetch_type ?? "github_repository")
  const [discovery, setDiscovery] = useState<Discovery>(websiteSource?.sitemap_url ? "sitemap" : "start")
  const [licenseDetection, setLicenseDetection] = useState<LicenseDetection>({ status: "idle" })
  const [licenseSpdx, setLicenseSpdx] = useState<string>(source?.license_spdx ?? "")
  const [licenseUrl, setLicenseUrl] = useState<string>(source?.license_url ?? "")
  const [isEnabled, setIsEnabled] = useState(source?.is_enabled ?? true)
  const repositoryRef = useRef<HTMLInputElement>(null)
  const isWebsite = fetchType === "website"
  const licenseOptions = isWebsite ? [...allowedLicenses, personalUseLicense] : allowedLicenses

  const getFieldError = (key: string): string | undefined => state.errors?.[key]?.[0]
  const hasFieldErrors = Object.values(state.errors ?? {}).some((messages) => (messages?.length ?? 0) > 0)

  /**
   * `<form action>` に渡すと、React が送信後にフォームをリセットして入力エラーのときに値が消える
   * （state で持つライセンス欄とも表示がずれる）。送信は onSubmit から Server Action を呼ぶ
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  /**
   * GitHub が検出したライセンスを Route Handler 経由で取る。許可リストにあり、ライセンス欄が未選択ならその値を選ぶ。
   * ライセンスのファイルの URL も、URL の欄が空ならその値を入れる
   */
  const detectLicense = async () => {
    const repository = repositoryRef.current?.value.trim() ?? ""
    if (repository === "") {
      setLicenseDetection({ message: "リポジトリを owner/name の形で入力してください。", status: "failed" })
      return
    }

    setLicenseDetection({ status: "detecting" })
    try {
      const res = await fetch(`/api/sources/license?repository=${encodeURIComponent(repository)}`)
      if (res.status === 400) {
        setLicenseDetection({ message: "リポジトリを owner/name の形で入力してください。", status: "failed" })
        return
      }
      /**
       * フォームの入力を消さないよう、ここではサインイン画面に移さない
       */
      if (res.status === 401) {
        setLicenseDetection({ message: "サインインの期限が切れました。ページを開き直してサインインしてください。", status: "failed" })
        return
      }
      if (!res.ok) throw new Error(`License detection failed: ${res.status}`)

      /**
       * Route Handler が @repo/api-schema のスキーマで検証済み
       */
      const result = (await res.json()) as DetectSourceLicenseResponse
      setLicenseDetection({ result, status: "detected" })
      const detectedLicense = result.license_spdx
      if (result.is_allowed && detectedLicense !== null) {
        setLicenseSpdx((current) => (current === "" ? detectedLicense : current))
      }
      const detectedLicenseUrl = result.license_url
      if (detectedLicenseUrl !== null) {
        setLicenseUrl((current) => (current === "" ? detectedLicenseUrl : current))
      }
    } catch {
      setLicenseDetection({ message: "ライセンスを検出できませんでした。時間をおいて再度お試しください。", status: "failed" })
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <form className="space-y-6 xl:col-span-2" noValidate onSubmit={handleSubmit}>
        <input name="fetch_type" type="hidden" value={fetchType} />
        {!isWebsite && <input name="is_enabled" type="hidden" value={String(isEnabled)} />}

        {state.message && (
          <div className="rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
            <p className="font-medium text-gray-800 dark:text-white/90">{state.message}</p>
          </div>
        )}

        <Section desc="問題一覧と出典表示に出る情報です。" title="基本情報">
          <Field error={getFieldError("name")} htmlFor="name" label="表示名">
            <input className={inputClass} defaultValue={source?.name} id="name" name="name" placeholder="例：React 公式ドキュメント" />
          </Field>
          <Field error={getFieldError("kind")} hint="ユーザーの問題一覧の絞り込みに使います。" label="種別">
            <div className="flex flex-wrap gap-6 text-sm text-gray-700 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input className="size-4 accent-brand-500" defaultChecked={(source?.kind ?? "docs") === "docs"} name="kind" type="radio" value="docs" />
                公式ドキュメント（Docs）
              </label>
              <label className="flex items-center gap-2">
                <input className="size-4 accent-brand-500" defaultChecked={source?.kind === "github"} name="kind" type="radio" value="github" />
                GitHub の文書（README・RFC など）
              </label>
            </div>
          </Field>
          <Field hint={isEdit ? "取得方法は登録後に変更できません。" : undefined} label="取得方法">
            <div className="grid gap-3 sm:grid-cols-2">
              {AVAILABLE_FETCH_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  disabled={isEdit}
                  aria-pressed={fetchType === option.key}
                  className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                    fetchType === option.key
                      ? "border-brand-500 bg-brand-25 ring-1 ring-brand-500 dark:bg-brand-500/10"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                  } ${isEdit && fetchType !== option.key ? "opacity-40" : ""}`}
                  onClick={() => {
                    setFetchType(option.key)
                    if (option.key === "github_repository" && licenseSpdx === personalUseLicense) setLicenseSpdx("")
                  }}
                  type="button"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-white/90">{option.label}</span>
                  <span className="mt-1 block text-theme-xs text-gray-500 dark:text-gray-400">{option.description}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field error={getFieldError("tag_ids")} hint="ユーザーの問題一覧の絞り込みに使います。タグはタグの画面で登録します。" label="技術タグ" labelId="source-tags-label">
            <TagPicker defaultSelectedIds={source?.tags.map((tag) => tag.id) ?? []} tags={tags} />
          </Field>
        </Section>

        {isWebsite ? (
          <Section desc="このサイトのオリジンの外には取りに行きません。robots.txt を守り、1 秒以上の間隔を空けて取得します。" title="取得元（サイト）">
            <Field error={getFieldError("site_url")} htmlFor="site-url" label="サイトの URL">
              <input className={`${inputClass} font-mono`} defaultValue={websiteSource?.site_url} id="site-url" name="site_url" placeholder="https://go.dev" />
            </Field>
            <Field error={getFieldError("sitemap_url") ?? getFieldError("start_url")} label="ページの見つけ方">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input checked={discovery === "sitemap"} className="size-4 accent-brand-500" name="discovery" onChange={() => setDiscovery("sitemap")} type="radio" value="sitemap" />
                  sitemap からページの一覧を得る
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input checked={discovery === "start"} className="size-4 accent-brand-500" name="discovery" onChange={() => setDiscovery("start")} type="radio" value="start" />
                  開始ページからリンクをたどる（sitemap が無いサイト）
                </label>
                <input
                  key={discovery}
                  aria-label={discovery === "sitemap" ? "sitemap の URL" : "開始ページの URL"}
                  className={`${inputClass} font-mono`}
                  defaultValue={(discovery === "sitemap" ? websiteSource?.sitemap_url : websiteSource?.start_url) ?? undefined}
                  name="discovery_url"
                  placeholder={discovery === "sitemap" ? "https://example.com/sitemap.xml" : "https://go.dev/doc/"}
                />
              </div>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field error={getFieldError("include_globs")} hint="URL のパスに対する glob。1 行に 1 つ。" htmlFor="include" label="対象パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={websiteSource?.include_globs.join("\n")} id="include" name="include_globs" placeholder="/doc/**" rows={3} />
              </Field>
              <Field error={getFieldError("exclude_globs")} hint="1 行に 1 つ。" htmlFor="exclude" label="除外パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={websiteSource?.exclude_globs.join("\n")} id="exclude" name="exclude_globs" placeholder="/doc/devel/**" rows={3} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field error={getFieldError("content_selector")} hint="未設定なら本文を自動で推定します。" htmlFor="content-selector" label="本文の CSS セレクタ">
                <input className={`${inputClass} font-mono`} defaultValue={websiteSource?.content_selector ?? undefined} id="content-selector" name="content_selector" placeholder="main article" />
              </Field>
              <Field error={getFieldError("exclude_selectors")} hint="本文から取り除く要素。1 行に 1 つ。" htmlFor="exclude-selectors" label="除外する CSS セレクタ">
                <textarea className={`${textareaClass} font-mono`} defaultValue={websiteSource?.exclude_selectors.join("\n")} id="exclude-selectors" name="exclude_selectors" placeholder=".feedback" rows={2} />
              </Field>
            </div>
          </Section>
        ) : (
          <Section desc="ファイルの blob SHA で変更を検出し、変わったファイルだけを取り込みます。" title="取得元（GitHub リポジトリ）">
            <Field error={getFieldError("repository")} htmlFor="repository" label="リポジトリ">
              <div className="flex gap-2">
                <input ref={repositoryRef} className={`${inputClass} font-mono`} defaultValue={githubSource?.repository} id="repository" name="repository" placeholder="owner/name" />
                <button
                  className={`${outlineButtonClass} shrink-0`}
                  disabled={licenseDetection.status === "detecting"}
                  onClick={detectLicense}
                  type="button"
                >
                  {licenseDetection.status === "detecting" ? "検出しています…" : "ライセンスを検出"}
                </button>
              </div>
              <LicenseDetectionMessage detection={licenseDetection} />
            </Field>
            <Field error={getFieldError("branch")} hint="既定はリポジトリの default branch。" htmlFor="branch" label="ブランチ">
              <input className={`${inputClass} font-mono sm:w-60`} defaultValue={githubSource?.branch ?? "main"} id="branch" name="branch" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field error={getFieldError("include_globs")} hint="リポジトリ内のファイルパスに対する glob。1 行に 1 つ。" htmlFor="include" label="対象パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={githubSource?.include_globs.join("\n")} id="include" name="include_globs" placeholder="src/content/learn/**/*.md" rows={3} />
              </Field>
              <Field error={getFieldError("exclude_globs")} hint="1 行に 1 つ。" htmlFor="exclude" label="除外パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={githubSource?.exclude_globs.join("\n")} id="exclude" name="exclude_globs" placeholder="**/CHANGELOG.md" rows={3} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field
                error={getFieldError("public_url_template")}
                hint="{path} にファイルパス（取り除くプレフィックスと拡張子を除いたもの）が入ります。未設定なら GitHub のファイルへのリンクを出します。"
                htmlFor="url-template"
                label="公開ページの URL 規則（任意）"
              >
                <input className={`${inputClass} font-mono`} defaultValue={githubSource?.public_url_template ?? undefined} id="url-template" name="public_url_template" placeholder="https://react.dev/{path}" />
              </Field>
              <Field error={getFieldError("public_url_strip_prefix")} htmlFor="strip-prefix" label="取り除くプレフィックス">
                <input className={`${inputClass} font-mono`} defaultValue={githubSource?.public_url_strip_prefix ?? undefined} id="strip-prefix" name="public_url_strip_prefix" placeholder="src/content/" />
              </Field>
            </div>
            {githubSource?.public_url_template && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-theme-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                {buildPublicUrlExample(githubSource.public_url_template, githubSource.public_url_strip_prefix)}
              </p>
            )}
          </Section>
        )}

        <Section
          desc={isWebsite
            ? "ライセンスの記載が無いサイトは「個人の学習用」を選びます（ローカルでだけ使えます）。"
            : "リポジトリの中にライセンスの記載があり、それが文章に掛かっているリポジトリだけを登録できます。許可リストにあるライセンスだけを選べます（CC-BY-SA・GPL・NonCommercial は選べません）。"}
          title="ライセンス"
        >
          {isWebsite && (
            <div className="rounded-xl border border-warning-500 bg-warning-50 p-4 text-sm dark:border-warning-500/30 dark:bg-warning-500/15">
              <p className="font-medium text-gray-800 dark:text-white/90">サイトのソースはローカルでだけ使います</p>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                収集はせず、URL から追加で取り込むページのソースになります。ライセンスの記載があればそのライセンスを、無ければ「個人の学習用」を選んでください。
              </p>
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field error={getFieldError("license_spdx")} htmlFor="license" label="ライセンス">
              <select className={selectClass} id="license" name="license_spdx" onChange={(event) => setLicenseSpdx(event.target.value)} value={licenseSpdx}>
                <option disabled value="">選択してください</option>
                {licenseOptions.map((license) => (
                  <option key={license} value={license}>{license === personalUseLicense ? PERSONAL_USE_LICENSE_LABEL : license}</option>
                ))}
              </select>
            </Field>
            <Field
              error={getFieldError("license_url")}
              hint={isWebsite
                ? "サイトのライセンス、または著作権・利用規約のページ。出典表示に出します。"
                : "リポジトリの中のライセンスのファイルの URL（https://github.com/{owner}/{repo}/blob/…）。出典表示に出します。"}
              htmlFor="license-url"
              label="ライセンスの記載がある URL"
            >
              <input className={`${inputClass} font-mono`} id="license-url" name="license_url" onChange={(event) => setLicenseUrl(event.target.value)} placeholder="https://..." value={licenseUrl} />
            </Field>
          </div>
        </Section>

        {!isWebsite && (
          <Section title="収集">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-white/90">このソースを収集する</p>
                <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">無効にすると次回から収集しません。公開済みの問題は残ります。</p>
              </div>
              <button
                aria-pressed={isEnabled}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10"}`}
                onClick={() => setIsEnabled((value) => !value)}
                type="button"
              >
                <span className="sr-only">このソースを収集する</span>
                <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${isEnabled ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </Section>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasFieldErrors && <p className="mr-auto text-sm text-error-500" role="alert">入力内容を確認してください。各欄の下に理由を表示しています。</p>}
          <Link className={outlineButtonClass} href="/sources">キャンセル</Link>
          <button className={primaryButtonClass} disabled={isPending} type="submit">{isEdit ? "保存する" : "登録する"}</button>
        </div>
      </form>

      <aside className="space-y-6">
        {detail && source ? (
          <>
            <section className={cardClass}>
              <div className="px-6 py-5">
                <h3 className={titleClass}>収集の状況</h3>
              </div>
              <dl className={`${cardBodyClass} space-y-4 text-sm`}>
                {githubSource && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">最終収集</dt>
                    <dd className="text-gray-800 dark:text-white/90">{githubSource.last_collected_at ? formatDateTime(githubSource.last_collected_at) : "未収集"}</dd>
                  </div>
                )}
                {githubSource?.last_collected_commit_sha && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">取り込んだコミット</dt>
                    <dd className="font-mono text-gray-800 dark:text-white/90">{githubSource.last_collected_commit_sha.slice(0, 7)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">本文候補</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    <Badge color="light" size="sm">収集済み {detail.passage_counts.collected}</Badge>
                    <Badge color="primary" size="sm">下書き {detail.passage_counts.draft}</Badge>
                    <Badge color="success" size="sm">公開 {detail.passage_counts.published}</Badge>
                    <Badge color="error" size="sm">却下 {detail.passage_counts.rejected}</Badge>
                  </dd>
                </div>
                {websiteSource && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">取得に失敗しているページ</dt>
                    <dd className="mt-2">
                      {detail.failed_pages.length === 0 ? (
                        <span className="text-gray-400">ありません</span>
                      ) : (
                        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                          {detail.failed_pages.map((page) => (
                            <li key={page.path} className="flex items-center justify-between gap-3 px-3 py-2">
                              <span className="truncate font-mono text-theme-xs text-gray-600 dark:text-gray-300">{page.path}</span>
                              <Badge color="error" size="sm">{page.http_status}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            {githubSource && (
              <section className={cardClass}>
                <div className="px-6 py-5">
                  <h3 className={titleClass}>試し実行</h3>
                  <p className={descClass}>DB に書かずに、最大 5 件の文書の抽出結果と切り分けを表示します。</p>
                </div>
                <div className={cardBodyClass}>
                  <pre className="rounded-lg bg-gray-900 px-4 py-3 font-mono text-theme-xs break-all whitespace-pre-wrap text-gray-100 dark:bg-black/40">
                    pnpm collect:passages --source-id={githubSource.id} --dry-run
                  </pre>
                </div>
              </section>
            )}
          </>
        ) : (
          <section className={cardClass}>
            <div className="px-6 py-5">
              <h3 className={titleClass}>登録の前に確認すること</h3>
            </div>
            <ul className={`${cardBodyClass} list-disc space-y-2 pl-10 text-sm text-gray-600 dark:text-gray-300`}>
              {isWebsite ? (
                <>
                  <li>ローカルでだけ使う（自分で読むためのページ）</li>
                  <li>robots.txt で対象パスが許可されている</li>
                  <li>本文が JavaScript で描画されていない（取得した HTML に本文がある）</li>
                </>
              ) : (
                <>
                  <li>リポジトリの中にライセンスの記載がある</li>
                  <li>そのライセンスがドキュメントの文章に掛かっている（コードだけのライセンスではない）</li>
                  <li>ライセンスが許可リストにある</li>
                  <li>GitHub に Markdown のソースがあるドキュメントは、こちらで登録する</li>
                </>
              )}
            </ul>
          </section>
        )}
      </aside>
    </div>
  )
}
