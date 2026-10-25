import type { Metadata } from "next"
import { notFound, unstable_rethrow } from "next/navigation"

import {
  activeSourceCollectionRunStatusSchema,
  allowedLicenseSchema,
  getSourcePathParamSchema,
  personalUseLicenseSchema,
} from "@repo/api-schema"

import { SourceForm } from "@/components/features/source/SourceForm"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { sourceApi } from "@/features/source/source.api"
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
const loadSource = async (id: string) => {
  if (!/^\d+$/.test(id)) notFound()
  const parsed = getSourcePathParamSchema.safeParse({ id })
  if (!parsed.success) notFound()

  try {
    return await sourceApi.getDetail(parsed.data.id)
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof ApiClientError && error.status === 404) notFound()
    throw error
  }
}

/**
 * ソースの編集。右に収集の状況と、GitHub のソースは今すぐ収集を出す
 */
export default async function EditSourcePage({ params }: Props) {
  const { id } = await params
  const [detail, { tags }] = await Promise.all([loadSource(id), tagApi.getList()])

  return (
    <>
      <PageBreadcrumb pageTitle={`ソースの編集：${detail.source.name}`} />
      <SourceForm
        activeCollectionRunStatuses={activeSourceCollectionRunStatusSchema.options}
        allowedLicenses={allowedLicenseSchema.options}
        detail={detail}
        personalUseLicense={personalUseLicenseSchema.value}
        tags={tags}
      />
    </>
  )
}
