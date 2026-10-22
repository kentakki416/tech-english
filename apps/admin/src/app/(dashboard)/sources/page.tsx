import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { SourceTable } from "@/components/features/source/SourceTable"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { sourceApi } from "@/features/source/source.api"
import { primaryButtonClass } from "@/libs/ui-classes"

export const metadata: Metadata = {
  title: "ソース",
}

/**
 * ソース一覧。Basic Tables と同じ構成（ComponentCard ＋ DataTable）
 */
export default async function SourcesPage() {
  /**
   * リクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const { sources } = await sourceApi.getList()

  return (
    <>
      <PageBreadcrumb pageTitle="ソース" />
      <div className="space-y-6">
        <ComponentCard desc="英文の取得元。有効な GitHub のソースだけを毎日の収集（collect:passages）が取り込みます。" title="ソース一覧">
          <div className="flex justify-end">
            <Link className={primaryButtonClass} href="/sources/new">ソースを登録</Link>
          </div>
          <SourceTable sources={sources} />
        </ComponentCard>
      </div>
    </>
  )
}
