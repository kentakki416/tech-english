import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getAdminPassagePathParamSchema } from "@repo/api-schema"

import { PassageReview } from "@/components/features/passage/PassageReview"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { passageApi } from "@/features/passage/passage.api"

export const metadata: Metadata = {
  title: "問題の確認・修正 | tech-english admin",
}

type Props = {
  params: Promise<{ id: string }>
}

/**
 * URL の id で問題を取る。正の整数でない id（`abc`・`0`・`1e3` など）、DB の ID の上限を超える id と、API が 404 を返す id は notFound
 */
const loadPassage = async (id: string) => {
  if (!/^\d+$/.test(id)) notFound()
  const parsed = getAdminPassagePathParamSchema.safeParse({ id })
  if (!parsed.success) notFound()

  const detail = await passageApi.getDetail(parsed.data.id)
  if (!detail) notFound()
  return detail
}

/**
 * 問題の確認・修正。左にユーザーと同じ見た目のプレビュー、右に設問・和訳・用語集・本文・基本情報のタブ
 */
export default async function PassageReviewPage({ params }: Props) {
  const { id } = await params
  const detail = await loadPassage(id)

  return (
    <>
      <PageBreadcrumb pageTitle="問題の確認・修正" />
      <PassageReview detail={detail} />
    </>
  )
}
