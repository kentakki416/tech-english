import { z } from "zod"

import {
  ACTIVE_SOURCE_COLLECTION_RUN_STATUSES,
  ALLOWED_LICENSES,
  GITHUB_REPOSITORY_PATTERN,
  MAX_SERIAL_ID,
  PASSAGE_STATUSES,
  PERSONAL_USE_LICENSE,
  SOURCE_COLLECTION_RUN_STATUSES,
  SOURCE_FETCH_TYPES,
  SOURCE_KINDS,
  SOURCE_LICENSES,
  SOURCE_SUGGESTION_ERROR_CODES,
} from "@repo/domain"

import { tagSchema } from "./tag"

// ========================================================
// 共通: ソースの入力・出力の部品
// ========================================================

/**
 * URL として解釈できなければ null を返す。
 * Zod の refine / superRefine は前段の検査（.url() など）が失敗しても実行されるため、new URL を直接呼ぶと throw しうる
 */
const tryParseUrl = (value: string): URL | null => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * http / https の URL かどうか。出典表示のリンクに出すため javascript: などのスキームを弾く
 */
const isWebUrl = (value: string): boolean => {
  const protocol = tryParseUrl(value)?.protocol
  return protocol === "http:" || protocol === "https:"
}

/**
 * GitHub のリポジトリ（owner/name）。GitHub はリポジトリ名の大文字・小文字を区別しないので、小文字にそろえて保存・検索する
 * （`reactjs/react.dev` と `ReactJS/react.dev` を別のソースとして登録できないようにするため）
 */
const githubRepositorySchema = z
  .string()
  .regex(GITHUB_REPOSITORY_PATTERN)
  .transform((value) => value.toLowerCase())

/**
 * ソースの取得方法。admin も一覧のクエリ（?fetch_type=）の解釈に使う（admin は @repo/domain を import できない）
 */
export const sourceFetchTypeSchema = z.enum(SOURCE_FETCH_TYPES)

/**
 * http / https の URL
 */
const webUrlSchema = z.string().url().refine((value) => isWebUrl(value), { message: "Must be an http(s) URL" })

/**
 * https のサイトの URL。オリジン（スキーム + ホスト）に正規化して保存する
 */
const httpsOriginSchema = z
  .string()
  .url()
  .refine((value) => tryParseUrl(value)?.protocol === "https:", { message: "Must be an https URL" })
  .transform((value) => new URL(value).origin)

/**
 * 許可リストのライセンス（SPDX 識別子）。admin の登録フォームの選択肢にも使う
 */
export const allowedLicenseSchema = z.enum(ALLOWED_LICENSES)

/**
 * ソースに入れられるライセンス（許可リストと個人の学習用）。個人の学習用はサイトのソースだけ
 */
export const sourceLicenseSchema = z.enum(SOURCE_LICENSES)

/**
 * 個人の学習用のライセンスの値。admin が選択肢を組み立てるのに使う（admin は @repo/domain を import できない）
 */
export const personalUseLicenseSchema = z.literal(PERSONAL_USE_LICENSE)

const globListSchema = z.array(z.string().trim().min(1).max(200)).max(50)

const nullableTextSchema = z.string().trim().min(1).max(500).nullable()

/**
 * 付けるタグの id（登録済みのタグから選ぶ）。重複は許さない。存在するかは service が確かめて 400 にする
 */
const tagIdListSchema = z
  .array(z.number().int().positive().max(MAX_SERIAL_ID))
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, { message: "tag_ids must not contain duplicate ids" })

/**
 * 取得方法によらない、登録と編集の共通の入力
 */
const sourceInputBaseSchema = z.object({
  exclude_globs: globListSchema,
  include_globs: globListSchema.min(1),
  name: z.string().trim().min(1).max(100),
  tag_ids: tagIdListSchema,
})

/**
 * GitHub のソースの、編集で変えられる入力。取得元（リポジトリ・ブランチ）・種別・ライセンスは登録で決まり、編集では変えない
 */
const githubRepositoryUpdateInputSchema = sourceInputBaseSchema.extend({
  fetch_type: z.literal("github_repository"),
  is_enabled: z.boolean(),
})

/**
 * GitHub リポジトリの Markdown から取得するソースの登録の入力
 */
const githubRepositoryInputSchema = githubRepositoryUpdateInputSchema.extend({
  branch: z.string().trim().min(1).max(255),
  kind: z.enum(SOURCE_KINDS).default("docs"),
  /**
   * 許可リスト外のライセンスはここで 400 になる
   */
  license_spdx: allowedLicenseSchema,
  license_url: webUrlSchema,
  repository: githubRepositorySchema,
})

/**
 * サイトのソースの、編集で変えられる入力。is_enabled は受け取らない。サイトの URL・種別は登録で決まり、編集では変えない
 */
const websiteUpdateInputSchema = sourceInputBaseSchema.extend({
  content_selector: nullableTextSchema,
  exclude_selectors: z.array(z.string().trim().min(1).max(200)).max(20),
  fetch_type: z.literal("website"),
  license_spdx: sourceLicenseSchema,
  license_url: webUrlSchema,
})

/**
 * サイトのページを取得するソースの登録の入力（ローカルの URL から追加だけが使う）
 */
const websiteInputSchema = websiteUpdateInputSchema.extend({
  kind: z.enum(SOURCE_KINDS).default("docs"),
  site_url: httpsOriginSchema,
})

type SourceCreateInput =
  | z.infer<typeof githubRepositoryInputSchema>
  | z.infer<typeof websiteInputSchema>

type SourceUpdateInput =
  | z.infer<typeof githubRepositoryUpdateInputSchema>
  | z.infer<typeof websiteUpdateInputSchema>

/**
 * リポジトリの中のファイルの URL（https://github.com/{owner}/{repo}/blob/{ref}/{path}）か。ブランチ・タグ・コミットは問わない。
 * owner・name は GitHub が大文字・小文字を区別しないので小文字で比べる（repository はスキーマで小文字にそろえてある）
 */
const isRepositoryFileUrl = (url: string, repository: string): boolean => {
  const parsed = tryParseUrl(url)
  if (parsed === null || parsed.protocol !== "https:" || parsed.hostname !== "github.com") return false
  const [owner, name, kind, ref, ...path] = parsed.pathname.split("/").slice(1)
  return `${owner}/${name}`.toLowerCase() === repository
    && kind === "blob"
    && ref !== undefined && ref !== ""
    && path.some((segment) => segment !== "")
}

/**
 * 対象パス・除外パスの glob の書き方。github はリポジトリ内の相対パスなので "/" で始めない。website は URL のパスなので "/" で始める
 */
const validateSourceGlobs = (value: SourceCreateInput | SourceUpdateInput, ctx: z.RefinementCtx): void => {
  const shouldStartWithSlash = value.fetch_type === "website"
  for (const key of ["include_globs", "exclude_globs"] as const) {
    value[key].forEach((glob, index) => {
      if (glob.startsWith("/") === shouldStartWithSlash) return
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: shouldStartWithSlash ? "Glob must start with /" : "Glob must not start with /",
        path: [key, index],
      })
    })
  }
}

/**
 * 登録の、取得方法ごとのフィールドをまたぐ検証
 */
const validateCreateSourceInput = (value: SourceCreateInput, ctx: z.RefinementCtx): void => {
  validateSourceGlobs(value, ctx)
  if (value.fetch_type === "github_repository" && !isRepositoryFileUrl(value.license_url, value.repository)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Must be a file URL in the repository (https://github.com/{owner}/{repo}/blob/...)",
      path: ["license_url"],
    })
  }
}

/**
 * 1 ソースのレスポンス（取得方法で項目が違う）
 */
const sourceBaseSchema = z.object({
  id: z.number().int(),
  exclude_globs: z.array(z.string()),
  include_globs: z.array(z.string()),
  is_enabled: z.boolean(),
  kind: z.enum(SOURCE_KINDS),
  last_collected_at: z.string().nullable(),
  license_url: z.string(),
  name: z.string(),
  tags: z.array(tagSchema),
  created_at: z.string(),
  updated_at: z.string(),
})

export const sourceSchema = z.discriminatedUnion("fetch_type", [
  sourceBaseSchema.extend({
    branch: z.string(),
    fetch_type: z.literal("github_repository"),
    last_collected_commit_sha: z.string().nullable(),
    license_spdx: allowedLicenseSchema,
    repository: z.string(),
  }),
  sourceBaseSchema.extend({
    content_selector: z.string().nullable(),
    exclude_selectors: z.array(z.string()),
    fetch_type: z.literal("website"),
    license_spdx: sourceLicenseSchema,
    site_url: z.string(),
  }),
])

export type SourceResponse = z.infer<typeof sourceSchema>

/**
 * 本文候補の状態ごとの件数（キーは PASSAGE_STATUSES）。状態を足したらキーも自動で増える
 */
export const passageCountsSchema = z.object(
  Object.fromEntries(PASSAGE_STATUSES.map((status) => [status, z.number().int()])) as Record<(typeof PASSAGE_STATUSES)[number], z.ZodNumber>,
)

export type PassageCountsResponse = z.infer<typeof passageCountsSchema>

/**
 * 収集（今すぐ収集）の 1 回の記録。件数は終わったときだけ、error は failed のときだけ入る
 */
export const sourceCollectionRunSchema = z.object({
  id: z.number().int(),
  created_passage_count: z.number().int().nullable(),
  error: z.string().nullable(),
  fetched_document_count: z.number().int().nullable(),
  finished_at: z.string().nullable(),
  started_at: z.string().nullable(),
  status: z.enum(SOURCE_COLLECTION_RUN_STATUSES),
  created_at: z.string(),
})

export type SourceCollectionRunResponse = z.infer<typeof sourceCollectionRunSchema>

/**
 * 収集中（queued / running）の状態。admin が「収集中か」を判定するのに使う（admin は @repo/domain を import できない）
 */
export const activeSourceCollectionRunStatusSchema = z.enum(ACTIVE_SOURCE_COLLECTION_RUN_STATUSES)

// ========================================================
// GET /api/admin/source - ソース一覧
// ========================================================

/**
 * ソース一覧のレスポンススキーマ。repository / site_url は取得方法でないほうが null、
 * latest_collection_run は最後の収集の記録（一度も収集していなければ null）
 */
export const getSourceListResponseSchema = z.object({
  sources: z.array(
    z.object({
      id: z.number().int(),
      fetch_type: sourceFetchTypeSchema,
      is_enabled: z.boolean(),
      kind: z.enum(SOURCE_KINDS),
      last_collected_at: z.string().nullable(),
      latest_collection_run: sourceCollectionRunSchema.nullable(),
      license_spdx: sourceLicenseSchema,
      name: z.string(),
      passage_counts: passageCountsSchema,
      repository: z.string().nullable(),
      site_url: z.string().nullable(),
      tags: z.array(tagSchema),
    }),
  ),
})

export type GetSourceListResponse = z.infer<typeof getSourceListResponseSchema>

// ========================================================
// GET /api/admin/source/:id - ソース詳細
// ========================================================

/**
 * ソース詳細のパスパラメータスキーマ
 */
export const getSourcePathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

/**
 * ソース詳細のレスポンススキーマ。latest_collection_run は最後の収集の記録（一度も収集していなければ null）
 */
export const getSourceResponseSchema = z.object({
  latest_collection_run: sourceCollectionRunSchema.nullable(),
  passage_counts: passageCountsSchema,
  source: sourceSchema,
})

export type GetSourcePathParam = z.infer<typeof getSourcePathParamSchema>
export type GetSourceResponse = z.infer<typeof getSourceResponseSchema>

// ========================================================
// POST /api/admin/source - ソースの登録
// ========================================================

/**
 * ソース登録のリクエストスキーマ。website は is_enabled を受け取らない（Zod が捨てる）
 */
export const createSourceRequestSchema = z
  .discriminatedUnion("fetch_type", [githubRepositoryInputSchema, websiteInputSchema])
  .superRefine(validateCreateSourceInput)

/**
 * ソース登録のレスポンススキーマ
 */
export const createSourceResponseSchema = sourceSchema

export type CreateSourceRequest = z.infer<typeof createSourceRequestSchema>
export type CreateSourceResponse = z.infer<typeof createSourceResponseSchema>

// ========================================================
// PUT /api/admin/source/:id - ソースの更新
// ========================================================

/**
 * ソース更新のパスパラメータスキーマ
 */
export const updateSourcePathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

/**
 * ソース更新のリクエストスキーマ（GitHub は有効 / 無効の切り替えを含む）。編集で変えられる項目だけを受け、ほかの項目は送られても
 * 捨てる（Zod の object の既定）。取得方法の変更は service が 400 にする
 */
export const updateSourceRequestSchema = z
  .discriminatedUnion("fetch_type", [githubRepositoryUpdateInputSchema, websiteUpdateInputSchema])
  .superRefine(validateSourceGlobs)

/**
 * ソース更新のレスポンススキーマ
 */
export const updateSourceResponseSchema = sourceSchema

export type UpdateSourcePathParam = z.infer<typeof updateSourcePathParamSchema>
export type UpdateSourceRequest = z.infer<typeof updateSourceRequestSchema>
export type UpdateSourceResponse = z.infer<typeof updateSourceResponseSchema>

// ========================================================
// POST /api/admin/source/:id/collection-runs - 今すぐ収集の依頼
// ========================================================

/**
 * 今すぐ収集の依頼のパスパラメータスキーマ
 */
export const createSourceCollectionRunPathParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
})

/**
 * 今すぐ収集の依頼のレスポンススキーマ（作った queued の記録）
 */
export const createSourceCollectionRunResponseSchema = z.object({
  collection_run: sourceCollectionRunSchema,
})

export type CreateSourceCollectionRunPathParam = z.infer<typeof createSourceCollectionRunPathParamSchema>
export type CreateSourceCollectionRunResponse = z.infer<typeof createSourceCollectionRunResponseSchema>

// ========================================================
// GET /api/admin/source/suggestion?fetch_type=...&url=... - URL からの登録の初期値
// ========================================================

/**
 * URL からの登録の初期値のクエリ文字列スキーマ。fetch_type は登録の画面の取得方法
 */
export const suggestSourceQueryStringSchema = z.object({
  fetch_type: sourceFetchTypeSchema,
  url: z.string().trim().max(2048).url().refine((value) => isWebUrl(value), { message: "Must be an http(s) URL" }),
})

/**
 * URL から初期値を作れない理由（400 の details[0].code）。admin が文言を分けるために読む
 */
export const sourceSuggestionErrorCodeSchema = z.enum(SOURCE_SUGGESTION_ERROR_CODES)

/**
 * GitHub が検出したライセンスと、それが許可リストにあるか。license_spdx が null なのは GitHub がライセンスを判定できなかったとき
 * （ファイルはあっても種類が分からない・複数ある）、license_url（GitHub が見つけたライセンスのファイルの URL）が null なのはライセンスのファイルが無いとき
 */
const detectedLicenseSchema = z.object({
  is_allowed: z.boolean(),
  license_spdx: z.string().nullable(),
  license_url: z.string().nullable(),
})

/**
 * URL からの登録の初期値のレスポンススキーマ。GitHub は検出したライセンス（許可リストかどうかを含む）を、
 * サイトは自動で判定できないので個人の学習用とサイトのトップを返す
 */
export const suggestSourceResponseSchema = z.discriminatedUnion("fetch_type", [
  z.object({
    branch: z.string(),
    default_branch: z.string(),
    detected_license: detectedLicenseSchema,
    fetch_type: z.literal("github_repository"),
    include_globs: z.array(z.string()),
    repository: z.string(),
  }),
  z.object({
    fetch_type: z.literal("website"),
    include_globs: z.array(z.string()),
    license_spdx: personalUseLicenseSchema,
    license_url: z.string(),
    site_url: z.string(),
  }),
])

export type SourceSuggestionErrorCode = z.infer<typeof sourceSuggestionErrorCodeSchema>
export type SuggestSourceQueryString = z.infer<typeof suggestSourceQueryStringSchema>
export type SuggestSourceResponse = z.infer<typeof suggestSourceResponseSchema>
