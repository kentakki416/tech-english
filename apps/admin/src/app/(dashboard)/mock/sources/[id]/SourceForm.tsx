"use client"

import Link from "next/link"
import { useState } from "react"

import Badge from "@/components/ui/badge/Badge"
import { type AdminFetchType, type AdminSource, ALLOWED_LICENSES, PERSONAL_USE_LICENSE } from "@/libs/mock-data"

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
} from "../../_components/ui"

const FETCH_TYPE_OPTIONS: { description: string, key: AdminFetchType, label: string }[] = [
  { description: "README・RFC・docs ディレクトリ、GitHub に Markdown のソースがある公式ドキュメント", key: "github_repository", label: "GitHub リポジトリ" },
  { description: "ローカルだけ。URL から追加でページを取り込むためのサイト（収集はしない）", key: "website", label: "サイト（URL から追加）" },
]

const PERSONAL_USE_LICENSE_LABEL = "個人の学習用（ライセンスなし）"

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

function Field({ children, hint, htmlFor, label }: { children: React.ReactNode, hint?: string, htmlFor?: string, label: string }) {
  return (
    <div>
      <label className={labelClass} htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  )
}

/**
 * ソースの登録・編集フォーム（モック）
 */
export function SourceForm({ initialFetchType, source }: { initialFetchType: AdminFetchType, source: AdminSource | null }) {
  const isEdit = source !== null
  const [fetchType, setFetchType] = useState<AdminFetchType>(source?.fetchType ?? initialFetchType)
  const [detectedLicense, setDetectedLicense] = useState<string | null>(null)
  const [isEnabled, setIsEnabled] = useState(source?.isEnabled ?? true)
  const isWebsite = fetchType === "website"
  const licenseOptions = isWebsite ? [...ALLOWED_LICENSES, PERSONAL_USE_LICENSE] : ALLOWED_LICENSES

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <form className="space-y-6 xl:col-span-2" onSubmit={event => event.preventDefault()}>
        <Section desc="問題一覧と出典表示に出る情報です。" title="基本情報">
          <Field htmlFor="name" label="表示名">
            <input className={inputClass} defaultValue={source?.name} id="name" placeholder="例：React 公式ドキュメント" />
          </Field>
          <Field hint="ユーザーの問題一覧の絞り込みに使います。" label="種別">
            <div className="flex flex-wrap gap-6 text-sm text-gray-700 dark:text-gray-300">
              <label className="flex items-center gap-2">
                <input className="size-4 accent-brand-500" defaultChecked={(source?.kind ?? "docs") === "docs"} name="kind" type="radio" />
                公式ドキュメント（Docs）
              </label>
              <label className="flex items-center gap-2">
                <input className="size-4 accent-brand-500" defaultChecked={source?.kind === "github"} name="kind" type="radio" />
                GitHub の文書（README・RFC など）
              </label>
            </div>
          </Field>
          <Field hint={isEdit ? "取得方法は登録後に変更できません。" : undefined} label="取得方法">
            <div className="grid gap-3 sm:grid-cols-2">
              {FETCH_TYPE_OPTIONS.map(option => (
                <button
                  key={option.key}
                  disabled={isEdit}
                  aria-pressed={fetchType === option.key}
                  className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                    fetchType === option.key
                      ? "border-brand-500 bg-brand-25 ring-1 ring-brand-500 dark:bg-brand-500/10"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                  } ${isEdit && fetchType !== option.key ? "opacity-40" : ""}`}
                  onClick={() => setFetchType(option.key)}
                  type="button"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-white/90">{option.label}</span>
                  <span className="mt-1 block text-theme-xs text-gray-500 dark:text-gray-400">{option.description}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field hint="カンマ区切り。ユーザーの問題一覧の絞り込みに使います。" htmlFor="tags" label="技術タグ">
            <input className={inputClass} defaultValue={source?.tags.join(", ")} id="tags" placeholder="例：react, frontend" />
          </Field>
        </Section>

        {isWebsite ? (
          <Section desc="このサイトのオリジンの外には取りに行きません。robots.txt を守り、1 秒以上の間隔を空けて取得します。" title="取得元（サイト）">
            <Field htmlFor="site-url" label="サイトの URL">
              <input className={`${inputClass} font-mono`} defaultValue={source?.origin} id="site-url" placeholder="https://go.dev" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field hint="URL のパスに対する glob。1 行に 1 つ。" htmlFor="include" label="対象パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={source?.includeGlobs.join("\n")} id="include" placeholder="/doc/**" rows={3} />
              </Field>
              <Field hint="1 行に 1 つ。" htmlFor="exclude" label="除外パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={source?.excludeGlobs.join("\n")} id="exclude" placeholder="/doc/devel/**" rows={3} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field hint="未設定なら本文を自動で推定します。" htmlFor="content-selector" label="本文の CSS セレクタ">
                <input className={`${inputClass} font-mono`} defaultValue={source?.contentSelector} id="content-selector" placeholder="main article" />
              </Field>
              <Field hint="本文から取り除く要素。1 行に 1 つ。" htmlFor="exclude-selectors" label="除外する CSS セレクタ">
                <textarea className={`${textareaClass} font-mono`} defaultValue={source?.excludeSelectors?.join("\n")} id="exclude-selectors" placeholder=".feedback" rows={2} />
              </Field>
            </div>
          </Section>
        ) : (
          <Section desc="ファイルの blob SHA で変更を検出し、変わったファイルだけを取り込みます。" title="取得元（GitHub リポジトリ）">
            <Field htmlFor="repository" label="リポジトリ">
              <div className="flex gap-2">
                <input className={`${inputClass} font-mono`} defaultValue={source?.origin} id="repository" placeholder="owner/name" />
                <button className={`${outlineButtonClass} shrink-0`} onClick={() => setDetectedLicense("MIT")} type="button">
                  ライセンスを検出
                </button>
              </div>
              {detectedLicense && (
                <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-theme-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                  GitHub が検出したライセンス：<span className="font-medium">{detectedLicense}</span>
                  。コードとドキュメントでライセンスが分かれているリポジトリでは、GitHub の検出はコードのライセンスのことがあります。ドキュメントの文章に掛かっているライセンスと、それが書かれたリポジトリの中のファイルを選んでください。
                </p>
              )}
            </Field>
            <Field hint="既定はリポジトリの default branch。" htmlFor="branch" label="ブランチ">
              <input className={`${inputClass} font-mono sm:w-60`} defaultValue={source?.branch ?? "main"} id="branch" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field hint="リポジトリ内のファイルパスに対する glob。1 行に 1 つ。" htmlFor="include" label="対象パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={source?.includeGlobs.join("\n")} id="include" placeholder="src/content/learn/**/*.md" rows={3} />
              </Field>
              <Field hint="1 行に 1 つ。" htmlFor="exclude" label="除外パス">
                <textarea className={`${textareaClass} font-mono`} defaultValue={source?.excludeGlobs.join("\n")} id="exclude" placeholder="**/CHANGELOG.md" rows={3} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field hint="{path} にファイルパス（取り除くプレフィックスと拡張子を除いたもの）が入ります。未設定なら GitHub のファイルへのリンクを出します。" htmlFor="url-template" label="公開ページの URL 規則（任意）">
                <input className={`${inputClass} font-mono`} defaultValue={source?.publicUrlTemplate} id="url-template" placeholder="https://react.dev/{path}" />
              </Field>
              <Field htmlFor="strip-prefix" label="取り除くプレフィックス">
                <input className={`${inputClass} font-mono`} defaultValue={source?.publicUrlStripPrefix} id="strip-prefix" placeholder="src/content/" />
              </Field>
            </div>
            {source?.publicUrlTemplate && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-theme-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                例：src/content/learn/thinking-in-react.md → https://react.dev/learn/thinking-in-react
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
            <Field htmlFor="license" label="ライセンス">
              <select className={selectClass} defaultValue={source?.licenseSpdx ?? ""} id="license">
                <option disabled value="">選択してください</option>
                {licenseOptions.map(license => (
                  <option key={license} value={license}>{license === PERSONAL_USE_LICENSE ? PERSONAL_USE_LICENSE_LABEL : license}</option>
                ))}
              </select>
            </Field>
            <Field
              hint={isWebsite
                ? "サイトのライセンス、または著作権・利用規約のページ。出典表示に出します。"
                : "リポジトリの中のライセンスのファイルの URL（https://github.com/{owner}/{repo}/blob/…）。出典表示に出します。"}
              htmlFor="license-url"
              label="ライセンスの記載がある URL"
            >
              <input className={`${inputClass} font-mono`} defaultValue={source?.licenseUrl} id="license-url" placeholder="https://..." />
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
                onClick={() => setIsEnabled(value => !value)}
                type="button"
              >
                <span className="sr-only">このソースを収集する</span>
                <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-theme-sm transition-transform ${isEnabled ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </Section>
        )}

        <div className="flex justify-end gap-3">
          <Link className={outlineButtonClass} href="/mock/sources">キャンセル</Link>
          <button className={primaryButtonClass} type="submit">{isEdit ? "保存する" : "登録する"}</button>
        </div>
      </form>

      <aside className="space-y-6">
        {isEdit ? (
          <>
            <section className={cardClass}>
              <div className="px-6 py-5">
                <h3 className={titleClass}>収集の状況</h3>
              </div>
              <dl className={`${cardBodyClass} space-y-4 text-sm`}>
                {!isWebsite && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">最終収集</dt>
                    <dd className="text-gray-800 dark:text-white/90">{source.lastCollectedAt ?? "未収集"}</dd>
                  </div>
                )}
                {source.lastCollectedCommitSha && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500 dark:text-gray-400">取り込んだコミット</dt>
                    <dd className="font-mono text-gray-800 dark:text-white/90">{source.lastCollectedCommitSha}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">本文候補</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    <Badge color="light" size="sm">収集済み {source.passageCounts.collected}</Badge>
                    <Badge color="primary" size="sm">下書き {source.passageCounts.draft}</Badge>
                    <Badge color="success" size="sm">公開 {source.passageCounts.published}</Badge>
                    <Badge color="error" size="sm">却下 {source.passageCounts.rejected}</Badge>
                  </dd>
                </div>
              </dl>
            </section>
            {!isWebsite && (
              <section className={cardClass}>
                <div className="px-6 py-5">
                  <h3 className={titleClass}>試し実行</h3>
                  <p className={descClass}>DB に書かずに、最大 5 件の文書の抽出結果と切り分けを表示します。</p>
                </div>
                <div className={cardBodyClass}>
                  <pre className="rounded-lg bg-gray-900 px-4 py-3 font-mono text-theme-xs break-all whitespace-pre-wrap text-gray-100 dark:bg-black/40">
                    pnpm collect:passages --source-id={source.id} --dry-run
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
