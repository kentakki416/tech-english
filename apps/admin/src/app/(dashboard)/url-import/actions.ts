"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import type { z } from "zod"

import {
  type CreateUrlImportResponse,
  createUrlImportRequestSchema,
  errorResponseSchema,
  type PreviewUrlImportResponse,
  previewUrlImportRequestSchema,
  urlImportErrorCodeSchema,
} from "@repo/api-schema"

import { urlImportApi } from "@/features/url-import/url-import.api"
import { ApiClientError } from "@/libs/api-client"

type UrlImportErrorCode = z.infer<typeof urlImportErrorCodeSchema>

/**
 * useActionState に返す状態。url は送った URL（確認の結果から保存するときに hidden で送り直す）。
 * errorCode は api が返した取り込めない理由（URL の形の誤り・想定外の失敗は null）
 */
export type UrlImportState =
  | { status: "idle" }
  | { errorCode: UrlImportErrorCode | null, message: string, status: "error", url: string }
  | { preview: PreviewUrlImportResponse, status: "previewed", url: string }
  | { result: CreateUrlImportResponse, status: "imported", url: string }

const INVALID_URL_MESSAGE = "URL を確かめてください（https のページの URL）。"

const UNEXPECTED_ERROR_MESSAGE = "取り込みに失敗しました。時間をおいてもう一度お試しください。"

const URL_IMPORT_ERROR_MESSAGES: Record<Exclude<UrlImportErrorCode, "http_error">, string> = {
  blocked_url: "サイトの外を指す URL・リダイレクトは取得できません。",
  crawl_delay_too_long: "サイトの robots.txt の Crawl-delay が長いため、この画面からは取得できません。",
  deadline_exceeded: "ページの取得が 20 秒以内に終わりませんでした。時間をおいてもう一度お試しください。",
  extraction_failed: "本文を抽出できませんでした。ソースの本文の CSS セレクタを確かめてください。",
  github_source: "このサイトは GitHub のソースで収集しています。収集（collect:passages）で取り込んでください。",
  network_error: "ページを取得できませんでした（タイムアウト・接続エラー）。",
  not_html: "HTML のページではありません。",
  out_of_target_path: "ソースの対象パスに合わないページです。ソースの対象パス・除外パスを確かめてください。",
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
 * http_error の details の message は、ページが返した HTTP のステータス
 */
const buildErrorMessage = (code: UrlImportErrorCode, detailMessage: string): string =>
  code === "http_error" ? `ページが HTTP ${detailMessage} を返しました。` : URL_IMPORT_ERROR_MESSAGES[code]

/**
 * api の 400 のうち取り込めない理由（details[0].code）は理由ごとの文言にし、それ以外の失敗は再試行を促す
 */
const convertApiErrorToState = (error: unknown, url: string): UrlImportState => {
  if (error instanceof ApiClientError && error.status === 400) {
    const body = errorResponseSchema.safeParse(error.body)
    const detail = body.success ? body.data.details?.[0] : undefined
    const code = urlImportErrorCodeSchema.safeParse(detail?.code)
    if (detail !== undefined && code.success) {
      return { errorCode: code.data, message: buildErrorMessage(code.data, detail.message), status: "error", url }
    }
  }
  console.error("URL import request failed", error)
  return { errorCode: null, message: UNEXPECTED_ERROR_MESSAGE, status: "error", url }
}

const readUrl = (formData: FormData): string => {
  const value = formData.get("url")
  return typeof value === "string" ? value : ""
}

/**
 * URL のページの取り込みを確認する Server Action（DB には書かない）
 */
export const previewUrlImportAction = async (_state: UrlImportState, formData: FormData): Promise<UrlImportState> => {
  const url = readUrl(formData)
  const parsed = previewUrlImportRequestSchema.safeParse({ url })
  if (!parsed.success) return { errorCode: null, message: INVALID_URL_MESSAGE, status: "error", url }

  try {
    const preview = await urlImportApi.preview(parsed.data)
    return { preview, status: "previewed", url: parsed.data.url }
  } catch (error) {
    unstable_rethrow(error)
    return convertApiErrorToState(error, url)
  }
}

/**
 * URL のページを本文候補として保存する Server Action。保存できたら問題一覧（収集済み）を作り直させる
 */
export const createUrlImportAction = async (_state: UrlImportState, formData: FormData): Promise<UrlImportState> => {
  const url = readUrl(formData)
  const parsed = createUrlImportRequestSchema.safeParse({ url })
  if (!parsed.success) return { errorCode: null, message: INVALID_URL_MESSAGE, status: "error", url }

  let result: CreateUrlImportResponse
  try {
    result = await urlImportApi.create(parsed.data)
  } catch (error) {
    unstable_rethrow(error)
    return convertApiErrorToState(error, url)
  }

  revalidatePath("/passages")
  return { result, status: "imported", url: parsed.data.url }
}
