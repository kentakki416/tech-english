import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { UrlImportForm } from "@/components/features/url-import/UrlImportForm"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { isLocalEnvironment } from "@/libs/environment"

export const metadata: Metadata = {
  title: "URL から追加",
}

/**
 * URL を入れてページを確認し、本文候補として保存する（docs/spec/url-import）。ローカルだけ
 */
export default function UrlImportPage() {
  if (!isLocalEnvironment) notFound()

  return (
    <>
      <PageBreadcrumb pageTitle="URL から追加" />
      <UrlImportForm />
    </>
  )
}
