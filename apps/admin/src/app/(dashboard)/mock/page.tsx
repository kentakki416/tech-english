import Link from "next/link"

import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

import { cardClass } from "./_components/ui"

const SCREENS: { description: string, href: string, spec: string, states: { href: string, label: string }[], title: string }[] = [
  {
    description: "登録済みのソース、取得方法、ライセンス、収集の状況",
    href: "/mock/content-sources",
    spec: "content-collection",
    states: [{ href: "/mock/content-sources?state=empty", label: "ソースが 0 件" }],
    title: "ソース一覧",
  },
  {
    description: "取得方法（GitHub / サイト）で入力欄が切り替わる登録・編集フォーム",
    href: "/mock/content-sources/new",
    spec: "content-collection",
    states: [
      { href: "/mock/content-sources/new?state=website", label: "新規（サイト）" },
      { href: "/mock/content-sources/1", label: "編集（GitHub）" },
      { href: "/mock/content-sources/7", label: "編集（サイト）" },
      { href: "/mock/content-sources/6", label: "編集（未収集のサイト）" },
    ],
    title: "ソースの登録・編集",
  },
  {
    description: "状態ごとの件数と一覧。下書きは要確認 → 古い順",
    href: "/mock/passages",
    spec: "question-generation",
    states: [
      { href: "/mock/passages?state=published", label: "公開" },
      { href: "/mock/passages?state=empty", label: "絞り込み結果が 0 件" },
    ],
    title: "問題一覧",
  },
  {
    description: "ユーザーと同じ見た目のプレビューと、設問・和訳・用語集・本文・基本情報の編集",
    href: "/mock/passages/42",
    spec: "question-generation",
    states: [
      { href: "/mock/passages/42?state=publish-error", label: "公開できない" },
      { href: "/mock/passages/42?state=published", label: "公開中" },
      { href: "/mock/passages/42?state=reject", label: "却下の確認" },
    ],
    title: "問題の確認・修正",
  },
]

/**
 * admin モックの画面一覧（レビュー用。製品の画面ではない）
 */
export default function MockIndexPage() {
  return (
    <>
      <PageBreadcrumb pageTitle="モック画面一覧" />
      <div className={cardClass}>
        <p className="px-6 py-5 text-sm text-gray-500 dark:text-gray-400">
          tech-english の admin 画面のモックです。ダミーデータで動き、API は呼びません。各画面の右下の「モック」から状態を切り替えられます。
        </p>
        <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          {SCREENS.map(screen => (
            <li key={screen.href} className="grid gap-2 px-6 py-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <div>
                <Link className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90" href={screen.href}>{screen.title}</Link>
                <p className="mt-0.5 font-mono text-theme-xs text-gray-400">{screen.spec}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{screen.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {screen.states.map(state => (
                    <Link
                      key={state.href}
                      className="rounded-md border border-gray-200 px-2 py-0.5 text-theme-xs text-gray-600 hover:border-gray-300 hover:text-gray-800 dark:border-gray-700 dark:text-gray-300"
                      href={state.href}
                    >
                      {state.label}
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
