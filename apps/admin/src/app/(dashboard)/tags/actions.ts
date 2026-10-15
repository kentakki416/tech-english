"use server"

import "server-only"

import { revalidatePath } from "next/cache"

import { createTagRequestSchema, deleteTagPathParamSchema, updateTagPathParamSchema, updateTagRequestSchema } from "@repo/api-schema"

import { tagApi } from "@/features/tag/tag.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * モーダルに返す結果。errors はリクエストのフィールド名ごと
 */
export type TagActionResult =
  | { ok: true }
  | { errors?: Record<string, string[] | undefined>, message?: string, ok: false }

const DUPLICATE_MESSAGE = "同じ名前のタグがあります（大文字・小文字は区別しません）。"

const NOT_FOUND_MESSAGE = "このタグは見つかりませんでした。画面を再読み込みしてください。"

const NAME_ERROR = "名前は 1〜30 文字で、カンマを含めずに入力してください。"

/**
 * API の失敗をモーダルの文言にする。409 は重複、404 は削除済み、それ以外は再試行を促す
 */
const convertApiErrorToResult = (error: unknown, fallbackMessage: string): TagActionResult => {
  if (error instanceof ApiClientError && error.status === 409) return { errors: { name: [DUPLICATE_MESSAGE] }, ok: false }
  if (error instanceof ApiClientError && error.status === 404) return { message: NOT_FOUND_MESSAGE, ok: false }
  console.error("Tag request failed", error)
  return { message: fallbackMessage, ok: false }
}

/**
 * タグの名前・色はソースの一覧・登録・編集にも出るので、ソースの画面もまとめて作り直す
 */
const revalidateTagPaths = () => {
  revalidatePath("/tags")
  revalidatePath("/content-sources", "layout")
}

/**
 * タグの作成。color が null（「自動」）なら送らず、api に割り当てさせる
 */
export const createTagAction = async (input: { color: string | null, name: string }): Promise<TagActionResult> => {
  /**
   * Server Action の引数はブラウザから届くので、形が不正でも例外にせず検証エラーにする
   */
  const isObject = typeof input === "object" && input !== null
  const parsed = createTagRequestSchema.safeParse(isObject && input.color === null ? { name: input.name } : input)
  if (!parsed.success) return { errors: { name: [NAME_ERROR] }, ok: false }

  try {
    await tagApi.create(parsed.data)
  } catch (error) {
    return convertApiErrorToResult(error, "追加に失敗しました。時間をおいて再度お試しください。")
  }
  revalidateTagPaths()
  return { ok: true }
}

/**
 * タグの名前と色の変更。Server Action の引数はブラウザから届くので、id も検証する
 */
export const updateTagAction = async (id: number, input: { color: string, name: string }): Promise<TagActionResult> => {
  const params = updateTagPathParamSchema.safeParse({ id })
  if (!params.success) return { message: NOT_FOUND_MESSAGE, ok: false }
  const parsed = updateTagRequestSchema.safeParse(input)
  if (!parsed.success) return { errors: { name: [NAME_ERROR] }, ok: false }

  try {
    await tagApi.update(params.data.id, parsed.data)
  } catch (error) {
    return convertApiErrorToResult(error, "保存に失敗しました。時間をおいて再度お試しください。")
  }
  revalidateTagPaths()
  return { ok: true }
}

/**
 * タグの削除。紐付いたソースからも外れる（api の ON DELETE CASCADE）
 */
export const deleteTagAction = async (id: number): Promise<TagActionResult> => {
  const params = deleteTagPathParamSchema.safeParse({ id })
  if (!params.success) return { message: NOT_FOUND_MESSAGE, ok: false }

  try {
    await tagApi.delete(params.data.id)
  } catch (error) {
    return convertApiErrorToResult(error, "削除に失敗しました。時間をおいて再度お試しください。")
  }
  revalidateTagPaths()
  return { ok: true }
}
