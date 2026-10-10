import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { SourceTable } from "@/components/features/content-source/SourceTable"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { contentSourceApi } from "@/features/content-source/content-source.api"
import { primaryButtonClass } from "@/libs/ui-classes"

export const metadata: Metadata = {
  title: "ソース | tech-english admin",
}

/**
 * ソース一覧。Basic Tables と同じ構成（ComponentCard ＋ DataTable）
 */
export default async function ContentSourcesPage() {
  /**
   * リクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const { sources } = await contentSourceApi.getList()
  const disabledWebsites = sources.filter((source) => source.fetch_type === "website" && !source.is_enabled)

  return (
    <>
      <PageBreadcrumb pageTitle="ソース" />
      <div className="space-y-6">
        {disabledWebsites.length > 0 && (
          <div className="rounded-xl border border-blue-light-500 bg-blue-light-50 p-4 text-sm dark:border-blue-light-500/30 dark:bg-blue-light-500/15">
            <p className="font-medium text-gray-800 dark:text-white/90">無効のサイトのソースがあります</p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              {disabledWebsites.map((source) => source.name).join("、")}
              。試し実行で本文が正しく取れていることを確認してから有効にしてください。
            </p>
          </div>
        )}
        <ComponentCard desc="英文の取得元。有効なソースだけを毎日の収集（collect:passages）が取り込みます。" title="ソース一覧">
          <div className="flex justify-end">
            <Link className={primaryButtonClass} href="/content-sources/new">ソースを登録</Link>
          </div>
          <SourceTable sources={sources} />
        </ComponentCard>
      </div>
    </>
  )
}
