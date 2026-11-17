"use server"

import { revalidatePath } from "next/cache"

import { updateUserGoalRequestSchema, updateUserRequestSchema } from "@repo/api-schema"

import { learningRecordApi } from "@/features/learning-record/learning-record.api"
import { userApi } from "@/features/user/user.api"

export type GoalFormState = { message?: string, status: "error" | "idle" | "saved" }

export type UpdateTimezoneResult = { status: "error" | "saved" }

/**
 * 空欄・空白だけの入力は null にする（API は空文字を受け付けない）
 */
const convertBlankToNull = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

/**
 * 目標の保存。週の目標の指標が「設定しない」なら指標と値を null にする
 */
export const saveGoalAction = async (_prev: GoalFormState, formData: FormData): Promise<GoalFormState> => {
  const metric = formData.get("weekly_metric")
  const parsed = updateUserGoalRequestSchema.safeParse({
    goal_text: convertBlankToNull(formData.get("goal_text")),
    target_date: convertBlankToNull(formData.get("target_date")),
    weekly_metric: metric === "none" ? null : metric,
    weekly_target: metric === "none" ? null : Number(formData.get("weekly_target")),
  })
  if (!parsed.success) return { message: "入力内容を確認してください。", status: "error" }

  try {
    await learningRecordApi.saveGoal(parsed.data)
  } catch {
    return { message: "保存に失敗しました。時間をおいて再度お試しください。", status: "error" }
  }
  revalidatePath("/")
  revalidatePath("/settings")
  return { status: "saved" }
}

/**
 * タイムゾーンの変更。記録済みの学習日は動かない（「今日」「今週」の求め方だけが変わる）
 */
export const updateTimezoneAction = async (timezone: string): Promise<UpdateTimezoneResult> => {
  /**
   * 引数はクライアントから届くので検証する
   */
  const parsed = updateUserRequestSchema.safeParse({ timezone })
  if (!parsed.success) return { status: "error" }

  try {
    await userApi.updateTimezone(parsed.data.timezone)
  } catch {
    return { status: "error" }
  }
  revalidatePath("/")
  revalidatePath("/settings")
  return { status: "saved" }
}
