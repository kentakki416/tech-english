import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { SourceFetchTypeTabs } from "@/components/features/source/SourceFetchTypeTabs"
import { SourceTable } from "@/components/features/source/SourceTable"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { sourceApi } from "@/features/source/source.api"
import { parseSourceListFetchType } from "@/features/source/source.params"
import { SOURCE_CREATE_PATHS, SOURCE_LIST_PATHS } from "@/features/source/source.paths"
import { primaryButtonClass } from "@/libs/ui-classes"

export const metadata: Metadata = {
  title: "ソース",
}

type Props = {
  searchParams: Promise<{ fetch_type?: string | string[] }>
}

const LIST_DESCRIPTIONS = {
  github_repository: "GitHub のリポジトリのソース。編集画面の「今すぐ収集」で本文候補を取り込みます。",
  website: "サイトのソース（ローカルだけ）。収集はせず、URL から追加でページを取り込むときに使います。",
}

/**
 * ソース一覧。上の [GitHub] [サイト]（`?fetch_type=`）で取得方法ごとに分ける。Basic Tables と同じ構成（ComponentCard ＋ DataTable）
 */
export default async function SourcesPage({ searchParams }: Props) {
  /**
   * リクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const [{ fetch_type: rawFetchType }, { sources }] = await Promise.all([searchParams, sourceApi.getList()])
  const fetchType = parseSourceListFetchType(rawFetchType)
  const counts = {
    github_repository: sources.filter((source) => source.fetch_type === "github_repository").length,
    website: sources.filter((source) => source.fetch_type === "website").length,
  }

  return (
    <>
      <PageBreadcrumb pageTitle="ソース" />
      <div className="space-y-6">
        <ComponentCard desc={LIST_DESCRIPTIONS[fetchType]} title="ソース一覧">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SourceFetchTypeTabs counts={counts} current={fetchType} hrefs={SOURCE_LIST_PATHS} />
            <Link className={primaryButtonClass} href={SOURCE_CREATE_PATHS[fetchType]}>ソースを登録</Link>
          </div>
          <SourceTable fetchType={fetchType} sources={sources.filter((source) => source.fetch_type === fetchType)} />
        </ComponentCard>
      </div>
    </>
  )
}
