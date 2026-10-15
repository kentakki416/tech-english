import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { MOCK_USERS } from "@/libs/mock-data"

import { MockStatePanel } from "../_components/MockStatePanel"

import { UserTable } from "./UserTable"

const STATES = [
  { href: "/mock/users", key: "normal", label: "通常（初期表示）" },
  { href: "/mock/users?state=empty", key: "empty", label: "絞り込み結果が 0 件" },
]

/**
 * ユーザー一覧（モック）
 */
export default async function MockUsersPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = state === "empty" ? "empty" : "normal"

  return (
    <>
      <PageBreadcrumb pageTitle="ユーザー" />
      <UserTable key={current} initialQuery={current === "empty" ? "zzz" : ""} users={MOCK_USERS} />
      <MockStatePanel current={current} states={STATES} />
    </>
  )
}
