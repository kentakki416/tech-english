"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { type SubmitAttemptRequest, submitAttemptPathParamSchema, submitAttemptRequestSchema } from "@repo/api-schema"

import { attemptApi } from "@/features/attempt/attempt.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * 提出に失敗したときだけ返る（成功したら結果画面へ redirect する）。
 * expired は期限切れ（API の 409）、failed はそれ以外（検証の失敗・通信の失敗。提出 API は冪等なので再送してよい）
 */
export type SubmitAttemptActionResult = { error: "expired" | "failed" }

/**
 * 回答の提出 → 結果画面へ。端末の途中経過は消さない（失敗したときに回答を失わないよう、結果画面が消す）
 */
export const submitAttemptAction = async (attemptId: number, input: SubmitAttemptRequest): Promise<SubmitAttemptActionResult> => {
  /**
   * bind した ID も入力もクライアントを経由するので検証する
   */
  const parsedId = submitAttemptPathParamSchema.safeParse({ id: attemptId })
  const parsedInput = submitAttemptRequestSchema.safeParse(input)
  if (!parsedId.success || !parsedInput.success) return { error: "failed" }

  try {
    await attemptApi.submit(parsedId.data.id, parsedInput.data)
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) return { error: "expired" }
    return { error: "failed" }
  }
  /**
   * 解答画面のキャッシュを捨てる（「戻る」で提出済みの挑戦の解答画面を出さず、取り直して結果画面へ redirect させる）
   */
  revalidatePath(`/attempts/${parsedId.data.id}`)
  /**
   * redirect は NEXT_REDIRECT という例外で実現されるので try / catch の外で呼ぶ
   */
  redirect(`/attempts/${parsedId.data.id}/result`)
}
