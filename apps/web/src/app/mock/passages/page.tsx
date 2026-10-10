import Link from "next/link"

import { AppHeader } from "../_components/AppHeader"
import { MockStatePanel } from "../_components/MockStatePanel"

import { PassageList } from "./PassageList"

const STATES = [
  { key: "normal", label: "通常" },
  { key: "no-results", label: "絞り込み結果が 0 件" },
]

/**
 * 問題一覧（モック）
 */
export default async function MockPassagesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const isNoResults = state === "no-results"
  return (
    <>
      <AppHeader current="passages" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-fg">問題</h1>
            <p className="mt-1 text-sm text-fg-muted">GitHub と公式ドキュメントの英文から作った長文読解の問題です。</p>
          </div>
          <Link
            className="grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink hover:bg-amber-bright"
            href="/mock/passages/57"
          >
            ランダムに 1 問解く
          </Link>
        </div>
        <PassageList key={isNoResults ? "no-results" : "normal"} initialNoResults={isNoResults} />
      </main>
      <MockStatePanel basePath="/mock/passages" current={isNoResults ? "no-results" : "normal"} states={STATES} />
    </>
  )
}
