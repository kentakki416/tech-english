import PageBreadcrumb from "@/components/layout/PageBreadCrumb"

import { MockStatePanel } from "../../_components/MockStatePanel"

import { PassageReview, type ReviewMockState } from "./PassageReview"

const STATES: { href: string, key: ReviewMockState, label: string }[] = [
  { href: "/mock/passages/42", key: "draft", label: "下書き（要確認あり）" },
  { href: "/mock/passages/42?state=publish-error", key: "publish-error", label: "公開できない" },
  { href: "/mock/passages/42?state=published", key: "published", label: "公開中" },
  { href: "/mock/passages/42?state=reject", key: "reject", label: "却下の確認" },
]

/**
 * 問題の確認・修正（モック）。どの id でも同じ問題を表示する
 */
export default async function MockPassageReviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const current = STATES.find(item => item.key === state)?.key ?? "draft"

  return (
    <>
      <PageBreadcrumb pageTitle="問題の確認・修正" />
      <PassageReview key={current} initialState={current} />
      <MockStatePanel current={current} states={STATES} />
    </>
  )
}
