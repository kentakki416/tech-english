import { connection } from "next/server"

import { allowedLicenseSchema, type GetSourceResponse, personalUseLicenseSchema } from "@repo/api-schema"

import { SourceCreateForm } from "@/components/features/source/SourceCreateForm"
import { SourceFetchTypeTabs } from "@/components/features/source/SourceFetchTypeTabs"
import PageBreadcrumb from "@/components/layout/PageBreadCrumb"
import { SOURCE_CREATE_PATHS } from "@/features/source/source.paths"
import { tagApi } from "@/features/tag/tag.api"

/**
 * GitHub・サイトのソースの登録の画面の中身。上の [GitHub] [サイト] で登録の画面を切り替える
 */
export async function SourceCreatePage({ fetchType }: { fetchType: GetSourceResponse["source"]["fetch_type"] }) {
  /**
   * タグの一覧をリクエストごとに API から取る（build 時に静的生成させない）
   */
  await connection()
  const { tags } = await tagApi.getList()

  return (
    <>
      <PageBreadcrumb pageTitle="ソースの登録" />
      <div className="mb-6">
        <SourceFetchTypeTabs current={fetchType} hrefs={SOURCE_CREATE_PATHS} />
      </div>
      <SourceCreateForm
        allowedLicenses={allowedLicenseSchema.options}
        fetchType={fetchType}
        personalUseLicense={personalUseLicenseSchema.value}
        tags={tags}
      />
    </>
  )
}
