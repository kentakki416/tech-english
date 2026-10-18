import type { Metadata } from "next"
import { connection } from "next/server"

import { allowedLicenseSchema } from "@repo/api-schema"

import { SourceForm } from "@/components/features/content-source/SourceForm"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { tagApi } from "@/features/tag/tag.api"

export const metadata: Metadata = {
  title: "ソースの登録",
}

/**
 * ソースの登録。初期の取得方法は GitHub
 */
export default async function NewContentSourcePage() {
  /**
   * タグの一覧をリクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const { tags } = await tagApi.getList()

  return (
    <>
      <PageBreadcrumb pageTitle="ソースの登録" />
      <SourceForm allowedLicenses={allowedLicenseSchema.options} detail={null} tags={tags} />
    </>
  )
}
