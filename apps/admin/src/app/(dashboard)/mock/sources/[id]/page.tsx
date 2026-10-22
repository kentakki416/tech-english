import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { MOCK_SOURCES } from "@/libs/mock-data"

import { MockStatePanel } from "../../_components/MockStatePanel"

import { SourceForm } from "./SourceForm"

const STATES = [
  { href: "/mock/sources/new", key: "new-github", label: "新規（GitHub）" },
  { href: "/mock/sources/new?state=website", key: "new-website", label: "新規（サイト）" },
  { href: "/mock/sources/1", key: "edit-github", label: "編集（GitHub）" },
  { href: "/mock/sources/7", key: "edit-website", label: "編集（サイト）" },
  { href: "/mock/sources/6", key: "edit-website-disabled", label: "編集（未収集のサイト）" },
]

/**
 * ソースの登録・編集（モック）。`/mock/sources/new` は新規、数値の id は編集
 */
export default async function MockSourceFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { id } = await params
  const { state } = await searchParams
  const source = MOCK_SOURCES.find(item => String(item.id) === id) ?? null
  const current = source
    ? source.id === 6 ? "edit-website-disabled" : source.fetchType === "website" ? "edit-website" : "edit-github"
    : state === "website" ? "new-website" : "new-github"

  return (
    <>
      <PageBreadcrumb pageTitle={source ? `ソースの編集：${source.name}` : "ソースの登録"} />
      <SourceForm key={current} initialFetchType={state === "website" ? "website" : "github_repository"} source={source} />
      <MockStatePanel current={current} states={STATES} />
    </>
  )
}
