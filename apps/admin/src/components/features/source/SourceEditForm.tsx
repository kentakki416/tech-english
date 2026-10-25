"use client"

import Link from "next/link"
import { type FormEvent, startTransition, useActionState, useRef, useState } from "react"

import type { DetectSourceLicenseResponse, GetSourceResponse, GetTagListResponse } from "@repo/api-schema"

import { type SourceFormState, updateSourceAction } from "@/app/(dashboard)/sources/actions"
import { SourceCollectionCard } from "@/components/features/source/SourceCollectionCard"
import {
  CollectionToggle,
  errorHintClass,
  Field,
  GitHubTargetFields,
  LICENSE_NOTE,
  LicenseFields,
  Section,
  SourceKindField,
  WebsiteTargetFields,
} from "@/components/features/source/SourceFormParts"
import { TagPicker } from "@/components/features/source/TagPicker"
import Badge from "@/components/ui/badge/Badge"
import { SOURCE_FETCH_TYPE_LABELS, type SourceCollectionRunStatus } from "@/features/source/source.labels"
import { formatDateTime } from "@/libs/date"
import { isLocalEnvironment } from "@/libs/environment"
import {
  cardBodyClass,
  cardClass,
  inputClass,
  outlineButtonClass,
  primaryButtonClass,
  titleClass,
} from "@/libs/ui-classes"

type FetchType = GetSourceResponse["source"]["fetch_type"]

/**
 * 「ライセンスを検出」の状態
 */
type LicenseDetection =
  | { status: "idle" }
  | { status: "detecting" }
  | { result: DetectSourceLicenseResponse, status: "detected" }
  | { message: string, status: "failed" }

const FETCH_TYPE_OPTIONS: { description: string, key: FetchType }[] = [
  { description: "README・RFC・docs ディレクトリ、GitHub に Markdown のソースがある公式ドキュメント", key: "github_repository" },
  { description: "ローカルだけ。URL から追加でページを取り込むためのサイト（収集はしない）", key: "website" },
]

/**
 * サイトのソースはローカルでだけ登録できる
 */
const AVAILABLE_FETCH_TYPE_OPTIONS = FETCH_TYPE_OPTIONS.filter((option) => isLocalEnvironment || option.key !== "website")

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
          {licenseFileName === null ? "ライセンスのファイルが見つかりませんでした（リポジトリ名の誤り・非公開のリポジトリでも同じ表示です）" : "ライセンスの種類を判定できませんでした"}
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
 * ソースの編集フォーム（取得方法は変更不可）。
 *
 * allowedLicenses はライセンス欄の選択肢（@repo/api-schema の許可リスト）、personalUseLicense はサイトのソースだけが選べる個人の学習用の値、
 * activeCollectionRunStatuses は収集中の状態の値。
 * Client Component で Zod のスキーマを import すると bundle に入るため、Server Component から渡す
 */
export function SourceEditForm({
  activeCollectionRunStatuses,
  allowedLicenses,
  detail,
  personalUseLicense,
  tags,
}: {
  activeCollectionRunStatuses: readonly SourceCollectionRunStatus[]
  allowedLicenses: readonly string[]
  detail: GetSourceResponse
  personalUseLicense: string
  tags: GetTagListResponse["tags"]
}) {
  const { source } = detail
  const githubSource = source.fetch_type === "github_repository" ? source : null
  const websiteSource = source.fetch_type === "website" ? source : null
  const isWebsite = websiteSource !== null

  const [state, formAction, isPending] = useActionState<SourceFormState, FormData>(updateSourceAction.bind(null, source.id), {})

  const [licenseDetection, setLicenseDetection] = useState<LicenseDetection>({ status: "idle" })
  const [licenseSpdx, setLicenseSpdx] = useState<string>(source.license_spdx)
  const [licenseUrl, setLicenseUrl] = useState<string>(source.license_url)
  const [isEnabled, setIsEnabled] = useState(source.is_enabled)
  const repositoryRef = useRef<HTMLInputElement>(null)
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
        <input name="fetch_type" type="hidden" value={source.fetch_type} />
        {!isWebsite && <input name="is_enabled" type="hidden" value={String(isEnabled)} />}

        {state.message && (
          <div className="rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
            <p className="font-medium text-gray-800 dark:text-white/90">{state.message}</p>
          </div>
        )}

        <Section desc="問題一覧と出典表示に出る情報です。" title="基本情報">
          <Field error={getFieldError("name")} htmlFor="name" label="表示名">
            <input className={inputClass} defaultValue={source.name} id="name" name="name" placeholder="例：React 公式ドキュメント" />
          </Field>
          <SourceKindField defaultKind={source.kind} error={getFieldError("kind")} />
          <Field hint="取得方法は登録後に変更できません。" label="取得方法">
            <div className="grid gap-3 sm:grid-cols-2">
              {AVAILABLE_FETCH_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  disabled
                  aria-pressed={source.fetch_type === option.key}
                  className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                    source.fetch_type === option.key
                      ? "border-brand-500 bg-brand-25 ring-1 ring-brand-500 dark:bg-brand-500/10"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                  } ${source.fetch_type !== option.key ? "opacity-40" : ""}`}
                  type="button"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-white/90">{SOURCE_FETCH_TYPE_LABELS[option.key]}</span>
                  <span className="mt-1 block text-theme-xs text-gray-500 dark:text-gray-400">{option.description}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field error={getFieldError("tag_ids")} hint="ユーザーの問題一覧の絞り込みに使います。タグはタグの画面で登録します。" label="技術タグ" labelId="source-tags-label">
            <TagPicker defaultSelectedIds={source.tags.map((tag) => tag.id)} tags={tags} />
          </Field>
        </Section>

        {websiteSource ? (
          <Section desc="このサイトのオリジンの外には取りに行きません。robots.txt を守り、1 秒以上の間隔を空けて取得します。" title="取得元（サイト）">
            <Field error={getFieldError("site_url")} htmlFor="site-url" label="サイトの URL">
              <input className={`${inputClass} font-mono`} defaultValue={websiteSource.site_url} id="site-url" name="site_url" placeholder="https://go.dev" />
            </Field>
            <WebsiteTargetFields
              defaults={{
                contentSelector: websiteSource.content_selector,
                excludeGlobs: websiteSource.exclude_globs,
                excludeSelectors: websiteSource.exclude_selectors,
                includeGlobs: websiteSource.include_globs,
              }}
              getFieldError={getFieldError}
            />
          </Section>
        ) : githubSource && (
          <Section desc="ファイルの blob SHA で変更を検出し、変わったファイルだけを取り込みます。" title="取得元（GitHub リポジトリ）">
            <Field error={getFieldError("repository")} htmlFor="repository" label="リポジトリ">
              <div className="flex gap-2">
                <input ref={repositoryRef} className={`${inputClass} font-mono`} defaultValue={githubSource.repository} id="repository" name="repository" placeholder="owner/name" />
                <button
                  className={`${outlineButtonClass} shrink-0`}
                  disabled={licenseDetection.status === "detecting"}
                  type="button"
                  onClick={detectLicense}
                >
                  {licenseDetection.status === "detecting" ? "検出しています…" : "ライセンスを検出"}
                </button>
              </div>
              <LicenseDetectionMessage detection={licenseDetection} />
            </Field>
            <GitHubTargetFields
              defaults={{
                branch: githubSource.branch,
                excludeGlobs: githubSource.exclude_globs,
                includeGlobs: githubSource.include_globs,
                publicUrlStripPrefix: githubSource.public_url_strip_prefix,
                publicUrlTemplate: githubSource.public_url_template,
              }}
              getFieldError={getFieldError}
            />
          </Section>
        )}

        <Section
          desc={isWebsite
            ? "ライセンスの記載が無いサイトは「個人の学習用」を選びます（ローカルでだけ使えます）。"
            : "リポジトリの中にライセンスの記載があり、それが文章に掛かっているリポジトリだけを登録できます。許可リストにあるライセンスだけを選べます（CC-BY-SA・GPL・NonCommercial は選べません）。"}
          title="ライセンス"
        >
          <LicenseFields
            fetchType={source.fetch_type}
            getFieldError={getFieldError}
            licenseOptions={licenseOptions}
            licenseSpdx={licenseSpdx}
            licenseUrl={licenseUrl}
            onLicenseSpdxChange={setLicenseSpdx}
            onLicenseUrlChange={setLicenseUrl}
          />
        </Section>

        {!isWebsite && (
          <Section title="収集">
            <CollectionToggle isEnabled={isEnabled} onToggle={() => setIsEnabled((value) => !value)} />
          </Section>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasFieldErrors && <p className="mr-auto text-sm text-error-500" role="alert">入力内容を確認してください。各欄の下に理由を表示しています。</p>}
          <Link className={outlineButtonClass} href="/sources">キャンセル</Link>
          <button className={primaryButtonClass} disabled={isPending} type="submit">保存する</button>
        </div>
      </form>

      <aside className="space-y-6">
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
          </dl>
        </section>
        {githubSource && (
          <SourceCollectionCard
            activeStatuses={activeCollectionRunStatuses}
            isEnabled={githubSource.is_enabled}
            run={detail.latest_collection_run}
            sourceId={githubSource.id}
          />
        )}
      </aside>
    </div>
  )
}
