import type { Metadata } from "next"

import { UrlImportForm } from "@/components/features/url-import/UrlImportForm"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

export const metadata: Metadata = {
  title: "URL から追加",
}

/**
 * URL を入れてページを確認し、本文候補として保存する（docs/spec/url-import）
 */
export default function UrlImportPage() {
  return (
    <>
      <PageBreadcrumb pageTitle="URL から追加" />
      <UrlImportForm />
    </>
  )
}
