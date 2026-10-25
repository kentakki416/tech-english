import Link from "next/link"

import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { MOCK_SOURCES } from "@/libs/mock-data"

import { MockStatePanel } from "../_components/MockStatePanel"
import { primaryButtonClass } from "../_components/ui"

import { SourceTable } from "./SourceTable"

const STATES = [
  { href: "/mock/sources", key: "normal", label: "通常" },
  { href: "/mock/sources?state=empty", key: "empty", label: "ソースが 0 件" },
]

/**
 * ソース一覧（モック）。Basic Table と同じ構成（ComponentCard ＋ DataTable）
 */
export default async function MockSourcesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const isEmpty = state === "empty"
  const sources = isEmpty ? [] : MOCK_SOURCES

  return (
    <>
      <PageBreadcrumb pageTitle="ソース" />
      <div className="space-y-6">
        <ComponentCard desc="英文の取得元。GitHub のソースの編集画面の「今すぐ収集」で本文候補を取り込みます。" title="ソース一覧">
          <div className="flex justify-end">
            <Link className={primaryButtonClass} href="/mock/sources/new">ソースを登録</Link>
          </div>
          <SourceTable sources={sources} />
        </ComponentCard>
      </div>
      <MockStatePanel current={isEmpty ? "empty" : "normal"} states={STATES} />
    </>
  )
}
