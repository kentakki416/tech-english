import type { Metadata } from "next"
import { connection } from "next/server"

import { tagColorSchema } from "@repo/api-schema"

import { TagTable } from "@/components/features/tag/TagTable"
import ComponentCard from "@/components/layout/ComponentCard"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { tagApi } from "@/features/tag/tag.api"

export const metadata: Metadata = {
  title: "タグ",
}

/**
 * タグの一覧。追加・編集・削除はモーダルで行う
 */
export default async function TagsPage() {
  /**
   * リクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const { tags } = await tagApi.getList()

  return (
    <>
      <PageBreadcrumb pageTitle="タグ" />
      <ComponentCard desc="ソースに付ける技術タグ。ソースの登録・編集では、ここで登録したタグから選びます。" title="タグ一覧">
        {/**
          * パレットの選択肢は Server Component から渡す（Client Component で Zod のスキーマを import すると bundle に入るため）
          */}
        <TagTable colors={tagColorSchema.options} tags={tags} />
      </ComponentCard>
    </>
  )
}
