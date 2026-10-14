import type { Metadata } from "next"
import Link from "next/link"

import { PassageFilters } from "@/components/features/passage/PassageFilters"
import { PassageList } from "@/components/features/passage/PassageList"
import { AppHeader } from "@/components/ui/AppHeader"
import { buildPassageSearchParams, buildRandomPassagePath, parsePassageSearchParams } from "@/features/passage/passage-query"
import { passageApi } from "@/features/passage/passage.api"
import { redirectIfSessionRejected } from "@/libs/session"

export const metadata: Metadata = {
  title: "問題",
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * 問題一覧。絞り込みは URL のクエリで持ち、変わるたびにこの Server Component が 1 ページ目を取り直す
 */
export default async function PassagesPage({ searchParams }: Props) {
  const filter = parsePassageSearchParams(await searchParams)
  const page = await passageApi.getList(filter).catch(redirectIfSessionRejected)

  return (
    <>
      <AppHeader current="passages" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-fg">問題</h1>
            <p className="mt-1 text-sm text-fg-muted">GitHub と公式ドキュメントの英文から作った長文読解の問題です。</p>
          </div>
          {page.total_count === 0 ? (
            <span
              aria-disabled="true"
              className="grid h-10 cursor-not-allowed place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink opacity-40"
            >
              ランダムに 1 問解く
            </span>
          ) : (
            <Link
              className="grid h-10 place-items-center rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink outline-none hover:bg-amber-bright focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              href={buildRandomPassagePath(filter)}
            >
              ランダムに 1 問解く
            </Link>
          )}
        </div>
        <PassageFilters filter={filter} tags={page.tags}>
          <p className="mt-4 text-xs text-fg-muted tabular-nums">{page.total_count} 問</p>
          <PassageList key={buildPassageSearchParams(filter).toString()} initialPage={page} query={filter} />
        </PassageFilters>
      </main>
    </>
  )
}
