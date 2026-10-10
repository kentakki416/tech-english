import Link from "next/link"

import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { MOCK_SOURCES } from "@/libs/mock-data"

import { MockStatePanel } from "../_components/MockStatePanel"
import { primaryButtonClass } from "../_components/ui"

import { SourceTable } from "./SourceTable"

const STATES = [
  { href: "/mock/content-sources", key: "normal", label: "通常" },
  { href: "/mock/content-sources?state=empty", key: "empty", label: "ソースが 0 件" },
]

/**
 * ソース一覧（モック）。Basic Table と同じ構成（ComponentCard ＋ DataTable）
 */
export default async function MockContentSourcesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const isEmpty = state === "empty"
  const sources = isEmpty ? [] : MOCK_SOURCES
  const disabledWebsites = sources.filter(source => source.fetchType === "website" && !source.isEnabled)

  return (
    <>
      <PageBreadcrumb pageTitle="ソース" />
      <div className="space-y-6">
        {disabledWebsites.length > 0 && (
          <div className="rounded-xl border border-blue-light-500 bg-blue-light-50 p-4 text-sm dark:border-blue-light-500/30 dark:bg-blue-light-500/15">
            <p className="font-medium text-gray-800 dark:text-white/90">無効のサイトのソースがあります</p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              {disabledWebsites.map(source => source.name).join("、")}
              。試し実行で本文が正しく取れていることを確認してから有効にしてください。
            </p>
          </div>
        )}
        <ComponentCard desc="英文の取得元。有効なソースだけを毎日の収集（collect:passages）が取り込みます。" title="ソース一覧">
          <div className="flex justify-end">
            <Link className={primaryButtonClass} href="/mock/content-sources/new">ソースを登録</Link>
          </div>
          <SourceTable sources={sources} />
        </ComponentCard>
      </div>
      <MockStatePanel current={isEmpty ? "empty" : "normal"} states={STATES} />
    </>
  )
}
