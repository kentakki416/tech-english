import type { GetSourceResponse } from "@repo/api-schema"

import { formatLicenseLabel } from "@/features/source/source.labels"
import {
  cardBodyClass,
  cardClass,
  descClass,
  hintClass,
  inputClass,
  labelClass,
  selectClass,
  textareaClass,
  titleClass,
} from "@/libs/ui-classes"

type SourceKind = GetSourceResponse["source"]["kind"]

type FetchType = GetSourceResponse["source"]["fetch_type"]

/**
 * フォームの入力エラーの最初の文言。キーはリクエストのフィールド名（snake_case）
 */
export type GetFieldError = (key: string) => string | undefined

export const LICENSE_NOTE = "コードとドキュメントでライセンスが分かれているリポジトリでは、GitHub の検出はコードのライセンスのことがあります。ドキュメントの文章に掛かっているライセンスと、それが書かれたリポジトリの中のファイルを選んでください。"

export const errorHintClass = "mt-1.5 text-xs text-error-500"

/**
 * 公開ページの URL 規則の変換例に使うファイルパス（取り除くプレフィックスと拡張子を除いたもの）
 */
const SAMPLE_PAGE_PATH = "learn/getting-started"

/**
 * 保存済みの URL 規則で、ファイルパスがどの URL になるかの例
 */
const buildPublicUrlExample = (template: string, stripPrefix: string | null): string =>
  `例：${stripPrefix ?? ""}${SAMPLE_PAGE_PATH}.md → ${template.replace("{path}", SAMPLE_PAGE_PATH)}`

export function Section({ children, desc, title }: { children: React.ReactNode, desc?: string, title: string }) {
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

export function Field({
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

export function SourceKindField({ defaultKind, error }: { defaultKind: SourceKind, error?: string }) {
  return (
    <Field error={error} hint="ユーザーの問題一覧の絞り込みに使います。" label="種別">
      <div className="flex flex-wrap gap-6 text-sm text-gray-700 dark:text-gray-300">
        <label className="flex items-center gap-2">
          <input className="size-4 accent-brand-500" defaultChecked={defaultKind === "docs"} name="kind" type="radio" value="docs" />
          公式ドキュメント（Docs）
        </label>
        <label className="flex items-center gap-2">
          <input className="size-4 accent-brand-500" defaultChecked={defaultKind === "github"} name="kind" type="radio" value="github" />
          GitHub の文書（README・RFC など）
        </label>
      </div>
    </Field>
  )
}

/**
 * ブランチは登録でだけ決め、編集では変えられないので GitHubTargetFields と分ける
 */
export function GitHubBranchField({ defaultBranch, error }: { defaultBranch: string, error?: string }) {
  return (
    <Field error={error} hint="既定はリポジトリの default branch。" htmlFor="branch" label="ブランチ">
      <input className={`${inputClass} font-mono sm:w-60`} defaultValue={defaultBranch} id="branch" name="branch" />
    </Field>
  )
}

/**
 * GitHub の取得元の欄（対象パス・除外パス・公開ページの URL 規則）
 */
export function GitHubTargetFields({
  defaults,
  getFieldError,
}: {
  defaults: {
    excludeGlobs: string[]
    includeGlobs: string[]
    publicUrlStripPrefix: string | null
    publicUrlTemplate: string | null
  }
  getFieldError: GetFieldError
}) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={getFieldError("include_globs")} hint="リポジトリ内のファイルパスに対する glob。1 行に 1 つ。" htmlFor="include" label="対象パス">
          <textarea className={`${textareaClass} font-mono`} defaultValue={defaults.includeGlobs.join("\n")} id="include" name="include_globs" placeholder="src/content/learn/**/*.md" rows={3} />
        </Field>
        <Field error={getFieldError("exclude_globs")} hint="1 行に 1 つ。" htmlFor="exclude" label="除外パス">
          <textarea className={`${textareaClass} font-mono`} defaultValue={defaults.excludeGlobs.join("\n")} id="exclude" name="exclude_globs" placeholder="**/CHANGELOG.md" rows={3} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field
          error={getFieldError("public_url_template")}
          hint="{path} にファイルパス（取り除くプレフィックスと拡張子を除いたもの）が入ります。未設定なら GitHub のファイルへのリンクを出します。"
          htmlFor="url-template"
          label="公開ページの URL 規則（任意）"
        >
          <input className={`${inputClass} font-mono`} defaultValue={defaults.publicUrlTemplate ?? undefined} id="url-template" name="public_url_template" placeholder="https://react.dev/{path}" />
        </Field>
        <Field error={getFieldError("public_url_strip_prefix")} htmlFor="strip-prefix" label="取り除くプレフィックス">
          <input className={`${inputClass} font-mono`} defaultValue={defaults.publicUrlStripPrefix ?? undefined} id="strip-prefix" name="public_url_strip_prefix" placeholder="src/content/" />
        </Field>
      </div>
      {defaults.publicUrlTemplate && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-theme-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
          {buildPublicUrlExample(defaults.publicUrlTemplate, defaults.publicUrlStripPrefix)}
        </p>
      )}
    </>
  )
}

/**
 * サイトの取得元の欄（対象パス・除外パス・CSS セレクタ）
 */
export function WebsiteTargetFields({
  defaults,
  getFieldError,
}: {
  defaults: {
    contentSelector: string | null
    excludeGlobs: string[]
    excludeSelectors: string[]
    includeGlobs: string[]
  }
  getFieldError: GetFieldError
}) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={getFieldError("include_globs")} hint="URL のパスに対する glob。1 行に 1 つ。" htmlFor="include" label="対象パス">
          <textarea className={`${textareaClass} font-mono`} defaultValue={defaults.includeGlobs.join("\n")} id="include" name="include_globs" placeholder="/doc/**" rows={3} />
        </Field>
        <Field error={getFieldError("exclude_globs")} hint="1 行に 1 つ。" htmlFor="exclude" label="除外パス">
          <textarea className={`${textareaClass} font-mono`} defaultValue={defaults.excludeGlobs.join("\n")} id="exclude" name="exclude_globs" placeholder="/doc/devel/**" rows={3} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={getFieldError("content_selector")} hint="未設定なら本文を自動で推定します。" htmlFor="content-selector" label="本文の CSS セレクタ">
          <input className={`${inputClass} font-mono`} defaultValue={defaults.contentSelector ?? undefined} id="content-selector" name="content_selector" placeholder="main article" />
        </Field>
        <Field error={getFieldError("exclude_selectors")} hint="本文から取り除く要素。1 行に 1 つ。" htmlFor="exclude-selectors" label="除外する CSS セレクタ">
          <textarea className={`${textareaClass} font-mono`} defaultValue={defaults.excludeSelectors.join("\n")} id="exclude-selectors" name="exclude_selectors" placeholder=".feedback" rows={2} />
        </Field>
      </div>
    </>
  )
}

/**
 * ライセンスとライセンスの記載がある URL。値は呼び出し側の state（検出・読み込みで値を入れるため）
 */
export function LicenseFields({
  fetchType,
  getFieldError,
  licenseOptions,
  licenseSpdx,
  licenseUrl,
  onLicenseSpdxChange,
  onLicenseUrlChange,
}: {
  fetchType: FetchType
  getFieldError: GetFieldError
  licenseOptions: readonly string[]
  licenseSpdx: string
  licenseUrl: string
  onLicenseSpdxChange: (value: string) => void
  onLicenseUrlChange: (value: string) => void
}) {
  const isWebsite = fetchType === "website"
  return (
    <>
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
          <select className={selectClass} id="license" name="license_spdx" value={licenseSpdx} onChange={(event) => onLicenseSpdxChange(event.target.value)}>
            <option disabled value="">選択してください</option>
            {licenseOptions.map((license) => (
              <option key={license} value={license}>{formatLicenseLabel(license)}</option>
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
          <input className={`${inputClass} font-mono`} id="license-url" name="license_url" placeholder="https://..." value={licenseUrl} onChange={(event) => onLicenseUrlChange(event.target.value)} />
        </Field>
      </div>
    </>
  )
}

/**
 * 「このソースを収集する」のスイッチ。値は呼び出し側が hidden の is_enabled で送る
 */
export function CollectionToggle({ isEnabled, onToggle }: { isEnabled: boolean, onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">このソースを収集する</p>
        <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">無効にすると「今すぐ収集」を押せなくなります。公開済みの問題は残ります。</p>
      </div>
      <button
        aria-pressed={isEnabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${isEnabled ? "bg-brand-500" : "bg-gray-200 dark:bg-white/10"}`}
        type="button"
        onClick={onToggle}
      >
        <span className="sr-only">このソースを収集する</span>
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${isEnabled ? "translate-x-5" : ""}`} />
      </button>
    </div>
  )
}
