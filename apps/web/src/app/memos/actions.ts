"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createMemoRequestSchema, updateMemoRequestSchema } from "@repo/api-schema"

import { memoApi } from "@/features/memo/memo.api"

/** useActionStateに返すフォームの状態 */
export type MemoFormState = {
  errors?: { title?: string[], body?: string[] }
  message?: string
}

/**
 * メモ作成のServer Action
 */
export const createMemoAction = async (
  _prev: MemoFormState,
  formData: FormData,
): Promise<MemoFormState> => {
  const parsed = createMemoRequestSchema.safeParse({
    body: formData.get("body"),
    title: formData.get("title")
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  try {
    await memoApi.create(parsed.data)
  } catch {
    return { message: "作成に失敗しました。時間をおいて再度お試しください。" }
  }

  revalidatePath("/memos") // 一覧キャッシュを無効化 -> 次のアクセスで最新にする
  redirect("/memos") // 一覧へ遷移 ⚠️ redirectはNEXT_REDIRECTという特別な例外処理によって実現しているので必ずtry catchの外に記載する
}

/**
 * メモ更新用のServer Action
 */
export const updateMemoAction = async (
  id: number,
  _prev: MemoFormState,
  formData: FormData
): Promise<MemoFormState> => {
  const parsed = updateMemoRequestSchema.safeParse({
    body: formData.get("body"),
    title: formData.get("title")
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  try {
    await memoApi.update(id, parsed.data)
  } catch {
    return { message: "更新に失敗しました。時間をおいて再度お試しください" }
  }

  revalidatePath("/memos")
  revalidatePath("/memos/${id}")
  redirect(`/memos/${id}`)
}

/**
 * メモ削除用のServer Action
 */
export const deleteMemoAction = async (id: number): Promise<void> => {
  await memoApi.delete(id)
  revalidatePath("/memos")
  redirect("/memos")
}