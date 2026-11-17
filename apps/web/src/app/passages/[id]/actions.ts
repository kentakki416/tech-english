"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { startAttemptPathParamSchema } from "@repo/api-schema"

import { attemptApi } from "@/features/attempt/attempt.api"

export type StartAttemptState = { message?: string }

const START_FAILED_MESSAGE = "開始できませんでした。時間をおいて再度お試しください。"

/**
 * 挑戦の開始（期限内の挑戦中があれば API がそれを返すので「再開」も同じ）→ 解答画面へ
 */
export const startAttemptAction = async (
  passageId: number,
  _prev: StartAttemptState,
  _formData: FormData,
): Promise<StartAttemptState> => {
  /**
   * bind した引数はクライアントを経由するので検証する
   */
  const parsed = startAttemptPathParamSchema.safeParse({ id: passageId })
  if (!parsed.success) return { message: START_FAILED_MESSAGE }

  let attemptId: number
  try {
    attemptId = (await attemptApi.start(parsed.data.id)).id
  } catch {
    return { message: START_FAILED_MESSAGE }
  }
  /**
   * 前に開いた同じ挑戦の解答画面のキャッシュ（古い途中の状態）を使わず、取り直させる
   */
  revalidatePath(`/attempts/${attemptId}`)
  /**
   * redirect は NEXT_REDIRECT という例外で実現されるので try / catch の外で呼ぶ
   */
  redirect(`/attempts/${attemptId}`)
}
