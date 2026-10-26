"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { redirect, unstable_rethrow } from "next/navigation"

import {
  createSourceCollectionRunPathParamSchema,
  createSourceRequestSchema,
  errorResponseSchema,
  updateSourceRequestSchema,
} from "@repo/api-schema"

import { sourceApi } from "@/features/source/source.api"
import { convertFormDataToSourceRequest } from "@/features/source/source.form"
import type { SourceCollectionRequestFailureReason } from "@/features/source/source.labels"
import { SOURCE_CREATE_PATHS, SOURCE_LIST_PATHS } from "@/features/source/source.paths"
import { ApiClientError } from "@/libs/api-client"

/**
 * useActionState に返すフォームの状態。errors はリクエストのフィールド名（snake_case）ごと
 */
export type SourceFormState = {
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
const convertApiErrorToFormState = (error: unknown, fallbackMessage: string, revalidatePaths: string[]): SourceFormState => {
  if (error instanceof ApiClientError && error.status === 409) return { message: DUPLICATE_MESSAGE }
  if (error instanceof ApiClientError && error.status === 400 && isMissingTagError(error)) {
    revalidatePaths.forEach((path) => revalidatePath(path))
    return { errors: { tag_ids: [MISSING_TAG_MESSAGE] } }
  }
  console.error("Source request failed", error)
  return { message: fallbackMessage }
}

/**
 * ソース登録の Server Action。成功したら、今すぐ収集を押せるよう編集画面へ遷移する
 */
export const createSourceAction = async (
  _prev: SourceFormState,
  formData: FormData,
): Promise<SourceFormState> => {
  const parsed = createSourceRequestSchema.safeParse(convertFormDataToSourceRequest(formData))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  let id: number
  try {
    id = (await sourceApi.create(parsed.data)).id
  } catch (error) {
    unstable_rethrow(error)
    return convertApiErrorToFormState(error, "登録に失敗しました。時間をおいて再度お試しください。", Object.values(SOURCE_CREATE_PATHS))
  }

  revalidatePath("/sources")
  /**
   * redirect は NEXT_REDIRECT という例外で実現されるため、try-catch の外に書く
   */
  redirect(`/sources/${id}`)
}

/**
 * ソース更新の Server Action（有効 / 無効の切り替えを含む）。成功したらそのソースの取得方法の一覧へ遷移する
 */
export const updateSourceAction = async (
  id: number,
  _prev: SourceFormState,
  formData: FormData,
): Promise<SourceFormState> => {
  const parsed = updateSourceRequestSchema.safeParse(convertFormDataToSourceRequest(formData))
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors }

  try {
    await sourceApi.update(id, parsed.data)
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof ApiClientError && error.status === 404) return { message: "このソースは見つかりませんでした。" }
    /**
     * 存在しないタグ以外の 400 は、取得した文書があるソースの取得元（リポジトリ・サイトの URL）の変更
     */
    if (error instanceof ApiClientError && error.status === 400 && !isMissingTagError(error)) return { message: ORIGIN_LOCKED_MESSAGE }
    return convertApiErrorToFormState(error, "保存に失敗しました。時間をおいて再度お試しください。", [`/sources/${id}`])
  }

  revalidatePath("/sources")
  revalidatePath(`/sources/${id}`)
  redirect(SOURCE_LIST_PATHS[parsed.data.fetch_type])
}

export type SourceCollectionRequestResult = { ok: false, reason: SourceCollectionRequestFailureReason } | { ok: true }

/**
 * API の失敗を、依頼が通らなかった理由にする。404 はソースが無いときにも返るが、編集画面を開けている（ソースがある）ので、
 * この環境に今すぐ収集のルートが無い（api の SOURCE_COLLECTION_TYPE=none）とみなす
 */
const convertCollectionRequestErrorToReason = (error: ApiClientError): SourceCollectionRequestFailureReason => {
  if (error.status === 409) return "running"
  if (error.status === 400) return "disabled"
  if (error.status === 404) return "unavailable"
  return "failed"
}

/**
 * 今すぐ収集の依頼の Server Action。収集は worker が裏で行うので、依頼が通ったら編集画面を読み直して「収集中」を出す。
 * 通らなかったときも読み直す（409 は別の管理者が先に押したので、最新の記録が収集中で返り、画面が収集中と読み直しに切り替わる）。
 * 引数はブラウザから届くので、API と同じスキーマで検証してからパスに使う
 */
export const requestSourceCollectionAction = async (sourceId: number): Promise<SourceCollectionRequestResult> => {
  const params = createSourceCollectionRunPathParamSchema.safeParse({ id: sourceId })
  if (!params.success) return { ok: false, reason: "failed" }
  const { id } = params.data

  try {
    await sourceApi.requestCollection(id)
  } catch (error) {
    unstable_rethrow(error)
    if (!(error instanceof ApiClientError)) throw error
    revalidatePath(`/sources/${id}`)
    return { ok: false, reason: convertCollectionRequestErrorToReason(error) }
  }
  revalidatePath(`/sources/${id}`)
  return { ok: true }
}
