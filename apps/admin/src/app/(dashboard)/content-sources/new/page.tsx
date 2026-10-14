import type { Metadata } from "next"

import { allowedLicenseSchema } from "@repo/api-schema"

import { SourceForm } from "@/components/features/content-source/SourceForm"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "ソースの登録 | tech-english admin",
}

/**
 * ソースの登録。初期の取得方法は GitHub
 */
export default function NewContentSourcePage() {
  return (
    <>
      <PageBreadcrumb pageTitle="ソースの登録" />
      <SourceForm allowedLicenses={allowedLicenseSchema.options} detail={null} />
    </>
  )
}
