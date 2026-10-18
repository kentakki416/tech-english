import type { Metadata } from "next"
import { connection } from "next/server"

import { UserTable } from "@/components/features/user/UserTable"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { userApi } from "@/features/user/user.api"
import { convertSearchParamsToUserListQuery } from "@/features/user/user.params"
import type { SearchParams } from "@/libs/search-params"

export const metadata: Metadata = {
  title: "ユーザー",
}

type Props = {
  searchParams: Promise<SearchParams>
}

/**
 * ユーザー一覧（admin-users の UI 設計）。絞り込み・並べ替え・ページ送りは URL のクエリ
 */
export default async function UsersPage({ searchParams }: Props) {
  await connection()
  const query = convertSearchParamsToUserListQuery(await searchParams)
  const list = await userApi.getList(query)

  return (
    <>
      <PageBreadcrumb pageTitle="ユーザー" />
      <UserTable list={list} query={query} />
    </>
  )
}
