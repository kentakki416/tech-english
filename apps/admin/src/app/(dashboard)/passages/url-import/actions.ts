"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"

import {
  type CreateUrlImportResponse,
  createUrlImportRequestSchema,
  errorResponseSchema,
  type PreviewUrlImportResponse,
  previewUrlImportRequestSchema,
  type UrlImportErrorCode,
  urlImportErrorCodeSchema,
} from "@repo/api-schema"

import { urlImportApi } from "@/features/url-import/url-import.api"
import { ApiClientError } from "@/libs/api-client"

/**
 * 取り込めなかったとき。errorCode は api が返した取り込めない理由（URL の形の誤り・想定外の失敗は null）
 */
export type UrlImportFailure = { errorCode: UrlImportErrorCode | null, message: string }

/**
 * useActionState に返す状態。previewed の url は確認した URL（保存するときに hidden で送り直す）、
 * saveFailure は確認の結果を残したまま出す保存の失敗
 */
export type UrlImportState =
  | { status: "idle" }
  | ({ status: "error" } & UrlImportFailure)
  | { preview: PreviewUrlImportResponse, saveFailure: UrlImportFailure | null, status: "previewed", url: string }
  | { result: CreateUrlImportResponse, status: "imported" }

const INVALID_URL_MESSAGE = "URL を確かめてください（https のページの URL）。"

const UNEXPECTED_ERROR_MESSAGE = "取り込みに失敗しました。時間をおいてもう一度お試しください。"

const URL_IMPORT_ERROR_MESSAGES: Record<Exclude<UrlImportErrorCode, "http_error" | "out_of_target_path">, string> = {
  blocked_url: "サイトの外を指す URL・リダイレクトは取得できません。",
  crawl_delay_too_long: "サイトの robots.txt の Crawl-delay が長いため、この画面からは取得できません。",
  deadline_exceeded: "ページの取得が 15 秒以内に終わりませんでした。時間をおいてもう一度お試しください。",
  extraction_failed: "本文を抽出できませんでした。ソースの本文の CSS セレクタを確かめてください。",
  github_source: "このサイトは GitHub のソースで収集しています。ソースの編集画面の「今すぐ収集」で取り込んでください。",
  network_error: "ページを取得できませんでした（タイムアウト・接続エラー）。",
  not_html: "HTML のページではありません。",
  redirect_not_allowed: "サイトの外を指す URL・リダイレクトは取得できません。",
  redirected_out_of_target: "リダイレクトの行き先が、ソースの対象パスの外です。",
  robots_disallowed: "robots.txt で取得が禁止されているページです。",
  robots_unavailable: "robots.txt を読めませんでした。時間をおいてもう一度お試しください。",
  source_not_found: "このサイトのソースが登録されていません。先にソースを登録してください。",
  throttled: "サイトが混雑しています（429 / 503）。時間をおいてもう一度お試しください。",
  too_large: "ページが大きすぎます（2MB 超）。",
  too_many_redirects: "リダイレクトが多すぎます。",
}

/**
 * details の message は、http_error ならページが返した HTTP のステータス、out_of_target_path なら当たったソースの表示名
 */
const buildErrorMessage = (code: UrlImportErrorCode, detailMessage: string): string => {
  if (code === "http_error") return `ページが HTTP ${detailMessage} を返しました。`
  if (code === "out_of_target_path") {
    return `「${detailMessage}」の対象パスに合わないページです。ソースの対象パス・除外パスを確かめてください（.pdf などのページでない拡張子も対象外です）。`
  }
  return URL_IMPORT_ERROR_MESSAGES[code]
}

/**
 * api の 400 のうち取り込めない理由（details[0].code）は理由ごとの文言にし、それ以外の失敗は再試行を促す
 */
const convertApiErrorToFailure = (error: unknown): UrlImportFailure => {
  if (error instanceof ApiClientError && error.status === 400) {
    const body = errorResponseSchema.safeParse(error.body)
    const detail = body.success ? body.data.details?.[0] : undefined
    const code = urlImportErrorCodeSchema.safeParse(detail?.code)
    if (detail !== undefined && code.success) {
      return { errorCode: code.data, message: buildErrorMessage(code.data, detail.message) }
    }
  }
  console.error("URL import request failed", error)
  return { errorCode: null, message: UNEXPECTED_ERROR_MESSAGE }
}

const readUrlField = (formData: FormData): string => {
  const value = formData.get("url")
  return typeof value === "string" ? value : ""
}

/**
 * URL のページの取り込みを確認する Server Action（DB には書かない）
 */
export const previewUrlImportAction = async (_state: UrlImportState, formData: FormData): Promise<UrlImportState> => {
  const url = readUrlField(formData)
  const parsed = previewUrlImportRequestSchema.safeParse({ url })
  if (!parsed.success) return { errorCode: null, message: INVALID_URL_MESSAGE, status: "error" }

  try {
    const preview = await urlImportApi.preview(parsed.data)
    return { preview, saveFailure: null, status: "previewed", url: parsed.data.url }
  } catch (error) {
    unstable_rethrow(error)
    return { ...convertApiErrorToFailure(error), status: "error" }
  }
}

/**
 * 保存の失敗を状態にする。確認の結果を出しているときはそれを残す（一時的な失敗なら、もう一度保存を押せばよい）
 */
const buildSaveFailureState = (state: UrlImportState, failure: UrlImportFailure): UrlImportState =>
  state.status === "previewed" ? { ...state, saveFailure: failure } : { ...failure, status: "error" }

/**
 * URL のページを本文候補として保存する Server Action。保存できたら問題一覧（収集済み）を作り直させる
 */
export const createUrlImportAction = async (state: UrlImportState, formData: FormData): Promise<UrlImportState> => {
  const url = readUrlField(formData)
  const parsed = createUrlImportRequestSchema.safeParse({ url })
  if (!parsed.success) return buildSaveFailureState(state, { errorCode: null, message: INVALID_URL_MESSAGE })

  let result: CreateUrlImportResponse
  try {
    result = await urlImportApi.create(parsed.data)
  } catch (error) {
    unstable_rethrow(error)
    return buildSaveFailureState(state, convertApiErrorToFailure(error))
  }

  revalidatePath("/passages")
  return { result, status: "imported" }
}
