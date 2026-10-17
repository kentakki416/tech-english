"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { redirect, unstable_rethrow } from "next/navigation"

import { createContentSourceRequestSchema, errorResponseSchema, updateContentSourceRequestSchema } from "@repo/api-schema"

import { contentSourceApi } from "@/features/content-source/content-source.api"
import { convertFormDataToContentSourceRequest } from "@/features/content-source/content-source.form"
import { ApiClientError } from "@/libs/api-client"

/**
 * useActionState に返すフォームの状態。errors はリクエストのフィールド名（snake_case）ごと
 */
export type ContentSourceFormState = {
  errors?: Record<string, string[] | undefined>
  message?: string
}

const DUPLICATE_MESSAGE = "同じリポジトリ・サイトがすでに登録されています。"

const ORIGIN_LOCKED_MESSAGE = "取得した文書があるソースは、リポジトリ・サイトの URL を変えられません。変えたいときは別のソースとして登録してください。"

const MISSING_TAG_MESSAGE = "選んだタグのうち、削除されたものがあります。画面を再読み込みしてタグを選び直してください。"

/**
 * API の 400 が、存在しないタグの id（tag_ids）によるものか。details の path で見分ける（api が path: ["tag_ids"] を付ける）
 */
const isMissingTagError = (error: ApiClientError): boolean => {
  const body = errorResponseSchema.safeParse(error.body)
  return body.success && (body.data.details ?? []).some((detail) => detail.path[0] === "tag_ids")
}

/**
 * API の失敗をフォームの文言にする。409 は重複、400（存在しないタグ）はタグの欄のエラー、それ以外は再試行を促す。
 * 存在しないタグのときは、ピッカーの tags が古いので revalidatePaths の画面を作り直させる
 */
const convertApiErrorToFormState = (error: unknown, fallbackMessage: string, revalidatePaths: string[]): ContentSourceFormState => {
  if (error instanceof ApiClientError && error.status === 409) return { message: DUPLICATE_MESSAGE }
  if (error instanceof ApiClientError && error.status === 400 && isMissingTagError(error)) {
    revalidatePaths.forEach((path) => revalidatePath(path))
    return { errors: { tag_ids: [MISSING_TAG_MESSAGE] } }
  }
  console.error("Content source request failed", error)
  return { message: fallbackMessage }
}

/**
 * ソース登録の Server Action。成功したら、試し実行のコマンド（id 入り）を見せるため編集画面へ遷移する
 */
export const createContentSourceAction = async (
  _prev: ContentSourceFormState,
  formData: FormData,
): Promise<ContentSourceFormState> => {
  const parsed = createContentSourceRequestSchema.safeParse(convertFormDataToContentSourceRequest(formData))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  let id: number
  try {
    id = (await contentSourceApi.create(parsed.data)).id
  } catch (error) {
    unstable_rethrow(error)
    return convertApiErrorToFormState(error, "登録に失敗しました。時間をおいて再度お試しください。", ["/content-sources/new"])
  }

  revalidatePath("/content-sources")
  /**
   * redirect は NEXT_REDIRECT という例外で実現されるため、try-catch の外に書く
   */
  redirect(`/content-sources/${id}`)
}

/**
 * ソース更新の Server Action（有効 / 無効の切り替えを含む）。成功したら一覧へ遷移する
 */
export const updateContentSourceAction = async (
  id: number,
  _prev: ContentSourceFormState,
  formData: FormData,
): Promise<ContentSourceFormState> => {
  const parsed = updateContentSourceRequestSchema.safeParse(convertFormDataToContentSourceRequest(formData))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  try {
    await contentSourceApi.update(id, parsed.data)
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof ApiClientError && error.status === 404) return { message: "このソースは見つかりませんでした。" }
    /**
     * 存在しないタグ以外の 400 は、取得した文書があるソースの取得元（リポジトリ・サイトの URL）の変更
     */
    if (error instanceof ApiClientError && error.status === 400 && !isMissingTagError(error)) return { message: ORIGIN_LOCKED_MESSAGE }
    return convertApiErrorToFormState(error, "保存に失敗しました。時間をおいて再度お試しください。", [`/content-sources/${id}`])
  }

  revalidatePath("/content-sources")
  revalidatePath(`/content-sources/${id}`)
  redirect("/content-sources")
}
