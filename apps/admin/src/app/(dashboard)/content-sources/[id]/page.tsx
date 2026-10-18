import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { allowedLicenseSchema, getContentSourcePathParamSchema } from "@repo/api-schema"

import { SourceForm } from "@/components/features/content-source/SourceForm"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { contentSourceApi } from "@/features/content-source/content-source.api"
import { tagApi } from "@/features/tag/tag.api"
import { ApiClientError } from "@/libs/api-client"

export const metadata: Metadata = {
  title: "ソースの編集",
}

type Props = {
  params: Promise<{ id: string }>
}

/**
 * URL の id でソースを取る。正の整数でない id（`abc`・`0`・`1e3` など）と、API が 404 を返す id は notFound
 */
const loadContentSource = async (id: string) => {
  if (!/^\d+$/.test(id)) notFound()
  const parsed = getContentSourcePathParamSchema.safeParse({ id })
  if (!parsed.success) notFound()

  try {
    return await contentSourceApi.getDetail(parsed.data.id)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }
}

/**
 * ソースの編集。右に収集の状況と試し実行のコマンドを出す
 */
export default async function EditContentSourcePage({ params }: Props) {
  const { id } = await params
  const [detail, { tags }] = await Promise.all([loadContentSource(id), tagApi.getList()])

  return (
    <>
      <PageBreadcrumb pageTitle={`ソースの編集：${detail.source.name}`} />
      <SourceForm allowedLicenses={allowedLicenseSchema.options} detail={detail} tags={tags} />
    </>
  )
}
