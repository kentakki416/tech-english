"use client"

import Link from "next/link"
import { type FormEvent, startTransition, useActionState, useEffect, useRef, useState } from "react"

import type { GetSourceResponse, GetTagListResponse } from "@repo/api-schema"

import { type SourceFormState, updateSourceAction } from "@/app/(dashboard)/sources/actions"
import { SourceCollectionCard } from "@/components/features/source/SourceCollectionCard"
import {
  CollectionToggle,
  Field,
  GitHubTargetFields,
  Section,
  WebsiteLicenseFields,
  WebsiteTargetFields,
} from "@/components/features/source/SourceFormParts"
import { TagPicker } from "@/components/features/source/TagPicker"
import Badge from "@/components/ui/badge/Badge"
import {
  formatLicenseLabel,
  SOURCE_FETCH_TYPE_LABELS,
  type SourceCollectionRunStatus,
} from "@/features/source/source.labels"
import { SOURCE_LIST_PATHS } from "@/features/source/source.paths"
import { formatDateTime } from "@/libs/date"
import {
  cardBodyClass,
  cardClass,
  inputClass,
  outlineButtonClass,
  primaryButtonClass,
  titleClass,
} from "@/libs/ui-classes"

const externalLinkClass = "font-mono text-brand-500 hover:text-brand-600"

function StatusRow({ children, label }: { children: React.ReactNode, label: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 text-right break-all text-gray-800 dark:text-white/90">{children}</dd>
    </div>
  )
}

/**
 * 並びを揃えて比べる。タグを外して付け直すと tag_ids の順序だけが変わり、変更が無いのに未保存になるため
 */
const serializeFormValues = (form: HTMLFormElement | null): string =>
  form === null ? "" : JSON.stringify([...new FormData(form).entries()].map(String).sort())

/**
 * ソースの編集フォーム。取得方法・取得元（リポジトリとブランチ・サイトの URL）・GitHub のライセンスは登録で決まって変えられないので、
 * 欄にせず「収集の状況」に出す。
 *
 * allowedLicenses と personalUseLicense はサイトのライセンス欄の選択肢（@repo/api-schema の許可リストと個人の学習用）、
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

  const [state, formAction, isPending] = useActionState<SourceFormState, FormData>(updateSourceAction.bind(null, source.id), {})

  const [licenseSpdx, setLicenseSpdx] = useState<string>(source.license_spdx)
  const [licenseUrl, setLicenseUrl] = useState<string>(source.license_url)
  const [isEnabled, setIsEnabled] = useState(source.is_enabled)
  const formRef = useRef<HTMLFormElement>(null)
  const savedFormValuesRef = useRef("")

  useEffect(() => {
    savedFormValuesRef.current = serializeFormValues(formRef.current)
  }, [])

  const hasUnsavedChanges = (): boolean => serializeFormValues(formRef.current) !== savedFormValuesRef.current

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

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <form ref={formRef} className="space-y-6 xl:col-span-2" noValidate onSubmit={handleSubmit}>
        <input name="fetch_type" type="hidden" value={source.fetch_type} />
        {githubSource && <input name="is_enabled" type="hidden" value={String(isEnabled)} />}

        {state.message && (
          <div className="rounded-xl border border-error-500 bg-error-50 p-4 text-sm dark:border-error-500/30 dark:bg-error-500/15" role="alert">
            <p className="font-medium text-gray-800 dark:text-white/90">{state.message}</p>
          </div>
        )}

        <Section title="基本情報">
          <Field error={getFieldError("name")} htmlFor="name" label="表示名">
            <input className={inputClass} defaultValue={source.name} id="name" name="name" placeholder="例：React 公式ドキュメント" />
          </Field>
          <Field error={getFieldError("tag_ids")} hint="ユーザーの問題一覧の絞り込みに使います。タグはタグの画面で登録します。" label="技術タグ" labelId="source-tags-label">
            <TagPicker defaultSelectedIds={source.tags.map((tag) => tag.id)} tags={tags} />
          </Field>
        </Section>

        {websiteSource ? (
          <>
            <Section desc="このサイトのオリジンの外には取りに行きません。robots.txt を守り、1 秒以上の間隔を空けて取得します。" title="取得元（サイト）">
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
            <Section desc="ライセンスの記載が無いサイトは「個人の学習用」を選びます（ローカルでだけ使えます）。" title="ライセンス">
              <WebsiteLicenseFields
                getFieldError={getFieldError}
                licenseOptions={[...allowedLicenses, personalUseLicense]}
                licenseSpdx={licenseSpdx}
                licenseUrl={licenseUrl}
                onLicenseSpdxChange={setLicenseSpdx}
                onLicenseUrlChange={setLicenseUrl}
              />
            </Section>
          </>
        ) : githubSource && (
          <>
            <Section desc="ファイルの blob SHA で変更を検出し、変わったファイルだけを取り込みます。" title="取得元（GitHub リポジトリ）">
              <GitHubTargetFields
                defaults={{
                  excludeGlobs: githubSource.exclude_globs,
                  includeGlobs: githubSource.include_globs,
                }}
                getFieldError={getFieldError}
              />
            </Section>
            <Section title="収集">
              <CollectionToggle isEnabled={isEnabled} onToggle={() => setIsEnabled((value) => !value)} />
            </Section>
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasFieldErrors && <p className="mr-auto text-sm text-error-500" role="alert">入力内容を確認してください。各欄の下に理由を表示しています。</p>}
          <Link className={outlineButtonClass} href={SOURCE_LIST_PATHS[source.fetch_type]}>キャンセル</Link>
          <button className={primaryButtonClass} disabled={isPending} type="submit">保存する</button>
        </div>
      </form>

      <aside className="space-y-6">
        <section className={cardClass}>
          <div className="px-6 py-5">
            <h3 className={titleClass}>収集の状況</h3>
          </div>
          <dl className={`${cardBodyClass} space-y-4 text-sm`}>
            <StatusRow label="取得方法">{SOURCE_FETCH_TYPE_LABELS[source.fetch_type]}</StatusRow>
            {githubSource && (
              <>
                <StatusRow label="リポジトリ">
                  <a className={externalLinkClass} href={`https://github.com/${githubSource.repository}`} rel="noreferrer" target="_blank">{githubSource.repository}</a>
                </StatusRow>
                <StatusRow label="ブランチ"><span className="font-mono">{githubSource.branch}</span></StatusRow>
              </>
            )}
            {websiteSource && (
              <StatusRow label="サイトの URL">
                <a className={externalLinkClass} href={websiteSource.site_url} rel="noreferrer" target="_blank">{websiteSource.site_url}</a>
              </StatusRow>
            )}
            {githubSource && (
              <>
                <StatusRow label="ライセンス">
                  <a className={externalLinkClass} href={githubSource.license_url} rel="noreferrer" target="_blank">{formatLicenseLabel(githubSource.license_spdx)}</a>
                </StatusRow>
                <StatusRow label="最終収集">{githubSource.last_collected_at ? formatDateTime(githubSource.last_collected_at) : "未収集"}</StatusRow>
                {githubSource.last_collected_commit_sha && (
                  <StatusRow label="取り込んだコミット"><span className="font-mono">{githubSource.last_collected_commit_sha.slice(0, 7)}</span></StatusRow>
                )}
              </>
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
            hasUnsavedChanges={hasUnsavedChanges}
            isEnabled={githubSource.is_enabled}
            run={detail.latest_collection_run}
            sourceId={githubSource.id}
          />
        )}
      </aside>
    </div>
  )
}
