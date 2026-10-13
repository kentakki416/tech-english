"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import type { ZodIssue } from "zod"

import {
  type ErrorDetail,
  errorResponseSchema,
  getAdminPassagePathParamSchema,
  type GetAdminPassageResponse,
  rejectAdminPassageRequestSchema,
  type UpdateAdminPassageRequest,
  updateAdminPassageRequestSchema,
} from "@repo/api-schema"

import { passageApi } from "@/features/passage/passage.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * 操作の失敗。error は画面の囲みの見出し、details は API の 400 の details（公開の条件・保存できない語句など）
 */
export type PassageActionFailure = {
  details: ErrorDetail[] | undefined
  error: string
  ok: false
  status: number
}

export type PassageActionResult = { ok: true } | PassageActionFailure

/**
 * 保存は、保存後の詳細も返す（追加した設問・語句の id が決まるので、続けて公開するときにエラーの印を正しい項目に付けられる）
 */
export type SavePassageActionResult = { detail: GetAdminPassageResponse, ok: true } | PassageActionFailure

const NOT_FOUND_MESSAGE = "この問題は見つかりませんでした。一覧から開き直してください。"

const CONFLICT_MESSAGE = "他の操作で状態が変わりました。画面を再読み込みしてください。"

const INVALID_ID_FAILURE: PassageActionFailure = { details: undefined, error: NOT_FOUND_MESSAGE, ok: false, status: 404 }

/**
 * 画面で扱う API の失敗（400 / 404 / 409）を失敗の結果にする。badRequestMessage は 400 の見出し（操作ごと）。
 * それ以外の失敗は throw して global-error.tsx に任せる
 */
const convertApiErrorToFailure = (error: unknown, badRequestMessage: string): PassageActionFailure => {
  if (!(error instanceof ApiClientError) || ![400, 404, 409].includes(error.status)) throw error
  const body = errorResponseSchema.safeParse(error.body)
  const details = body.success ? body.data.details : undefined
  const message = { 400: badRequestMessage, 404: NOT_FOUND_MESSAGE, 409: CONFLICT_MESSAGE }[error.status as 400 | 404 | 409]
  return { details, error: message, ok: false, status: error.status }
}

/**
 * Server Action の引数はブラウザから届くので、id を検証する（API のパスに文字列を混ぜない）
 */
const parsePassageId = (id: unknown): number | null => {
  const parsed = getAdminPassagePathParamSchema.safeParse({ id })
  return parsed.success ? parsed.data.id : null
}

/**
 * 保存のリクエストのスキーマ検証の不合格を details にする（タイトル・制限時間・空の英文は画面が先に検査するので、ここは文字数の上限などの保険）
 */
const convertIssueToDetail = (issue: ZodIssue): ErrorDetail => {
  const [field] = issue.path
  const message = field === "title"
    ? "タイトルは 1〜255 文字で入力してください"
    : field === "time_limit_seconds"
      ? "制限時間は m:ss の形で入力してください（例 5:30）"
      : `入力内容を確認してください（${issue.path.join(".")}：${issue.message}）`
  return { code: issue.code, message, path: issue.path }
}

const revalidatePassagePaths = (id: number) => {
  revalidatePath("/passages")
  revalidatePath(`/passages/${id}`)
}

/**
 * 下書きを保存する。400 の details（["glossary", i, "surface"] など）は画面が該当の項目に出す
 */
export const savePassageAction = async (id: number, request: UpdateAdminPassageRequest): Promise<SavePassageActionResult> => {
  const passageId = parsePassageId(id)
  if (passageId === null) return INVALID_ID_FAILURE

  const parsed = updateAdminPassageRequestSchema.safeParse(request)
  if (!parsed.success) {
    return {
      details: parsed.error.issues.map(convertIssueToDetail),
      error: "入力内容に誤りがあるため、保存できませんでした",
      ok: false,
      status: 400,
    }
  }

  let detail: GetAdminPassageResponse
  try {
    detail = await passageApi.update(passageId, parsed.data)
  } catch (error) {
    return convertApiErrorToFailure(error, "入力内容に誤りがあるため、保存できませんでした")
  }
  revalidatePassagePaths(passageId)
  return { detail, ok: true }
}

/**
 * 公開する。公開の条件を満たさなければ 400 で、満たしていない条件を details に返す
 */
export const publishPassageAction = async (id: number): Promise<PassageActionResult> => {
  const passageId = parsePassageId(id)
  if (passageId === null) return INVALID_ID_FAILURE

  try {
    await passageApi.publish(passageId)
  } catch (error) {
    return convertApiErrorToFailure(error, "公開の条件を満たしていないため、公開できません")
  }
  revalidatePassagePaths(passageId)
  return { ok: true }
}

/**
 * 却下する（理由は必須）
 */
export const rejectPassageAction = async (id: number, reason: string): Promise<PassageActionResult> => {
  const passageId = parsePassageId(id)
  if (passageId === null) return INVALID_ID_FAILURE

  const parsed = rejectAdminPassageRequestSchema.safeParse({ reason })
  if (!parsed.success) return { details: undefined, error: "却下の理由を 1〜1000 文字で入力してください", ok: false, status: 400 }

  try {
    await passageApi.reject(passageId, parsed.data.reason)
  } catch (error) {
    return convertApiErrorToFailure(error, "却下の理由を 1〜1000 文字で入力してください")
  }
  revalidatePassagePaths(passageId)
  return { ok: true }
}

/**
 * 公開中の問題を下書きに戻す
 */
export const unpublishPassageAction = async (id: number): Promise<PassageActionResult> => {
  const passageId = parsePassageId(id)
  if (passageId === null) return INVALID_ID_FAILURE

  try {
    await passageApi.unpublish(passageId)
  } catch (error) {
    return convertApiErrorToFailure(error, "非公開に戻せませんでした")
  }
  revalidatePassagePaths(passageId)
  return { ok: true }
}

/**
 * 生成した内容を消して生成待ち（収集済み）に戻す
 */
export const regeneratePassageAction = async (id: number): Promise<PassageActionResult> => {
  const passageId = parsePassageId(id)
  if (passageId === null) return INVALID_ID_FAILURE

  try {
    await passageApi.regenerate(passageId)
  } catch (error) {
    return convertApiErrorToFailure(error, "再生成できませんでした")
  }
  revalidatePassagePaths(passageId)
  return { ok: true }
}
