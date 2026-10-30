import type { Metadata } from "next"
import Link from "next/link"

import { adminPassageStatusSchema } from "@repo/api-schema"

import { PassageTable } from "@/components/features/passage/PassageTable"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { passageApi } from "@/features/passage/passage.api"
import { isLocalEnvironment } from "@/libs/environment"
import { primaryButtonClass } from "@/libs/ui-classes"

export const metadata: Metadata = {
  title: "問題",
}

type Props = {
  searchParams: Promise<{ status?: string | string[] }>
}

/**
 * 問題一覧。状態ごとの件数のカードと、選んだ状態の表（ComponentCard ＋ DataTable）。状態は `?status=`（不正・未指定は下書き）
 */
export default async function PassagesPage({ searchParams }: Props) {
  const { status: rawStatus } = await searchParams
  const parsed = adminPassageStatusSchema.safeParse(rawStatus)
  const status = parsed.success ? parsed.data : "draft"
  const list = await passageApi.getListByStatus(status)

  return (
    <>
      <PageBreadcrumb pageTitle="問題" />
      {isLocalEnvironment && (
        <div className="mb-6 flex justify-end">
          <Link className={primaryButtonClass} href="/passages/url-import">URL から追加</Link>
        </div>
      )}
      <PassageTable isTruncated={list.isTruncated} passages={list.passages} status={status} statusCounts={list.statusCounts} />
    </>
  )
}
