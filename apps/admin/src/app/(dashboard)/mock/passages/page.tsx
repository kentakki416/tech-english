import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

import { MockStatePanel } from "../_components/MockStatePanel"

import { PassageTable } from "./PassageTable"

const STATES = [
  { href: "/mock/passages", key: "draft", label: "下書き（初期表示）" },
  { href: "/mock/passages?state=published", key: "published", label: "公開" },
  { href: "/mock/passages?state=empty", key: "empty", label: "絞り込み結果が 0 件" },
]

/**
 * 問題一覧（モック）
 */
export default async function MockPassagesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = state === "published" || state === "empty" ? state : "draft"

  return (
    <>
      <PageBreadcrumb pageTitle="問題" />
      <PassageTable
        key={current}
        initialStatus={current === "published" ? "published" : "draft"}
        isEmpty={current === "empty"}
      />
      <MockStatePanel current={current} states={STATES} />
    </>
  )
}
