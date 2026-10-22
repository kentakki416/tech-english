import { z } from "zod"

import {
  ALLOWED_LICENSES,
  MAX_SERIAL_ID,
  PASSAGE_STATUSES,
  PERSONAL_USE_LICENSE,
  SOURCE_FETCH_TYPES,
  SOURCE_KINDS,
  SOURCE_LICENSES,
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
 * GitHub のリポジトリ（owner/name）。owner は英数字とハイフン（39 文字まで）、name は英数字と . _ -（"." と ".." は不可）。
 * GitHub はリポジトリ名の大文字・小文字を区別しないので、小文字にそろえて保存・検索する
 * （`reactjs/react.dev` と `ReactJS/react.dev` を別のソースとして登録できないようにするため）
 */
const githubRepositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/)
  .transform((value) => value.toLowerCase())

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
 * 取得方法によらない共通の入力
 */
const sourceInputBaseSchema = z.object({
  exclude_globs: globListSchema,
  include_globs: globListSchema.min(1),
  kind: z.enum(SOURCE_KINDS),
  license_url: webUrlSchema,
  name: z.string().trim().min(1).max(100),
  tag_ids: tagIdListSchema,
})

/**
 * GitHub リポジトリの Markdown から取得するソースの入力
 */
const githubRepositoryInputSchema = sourceInputBaseSchema.extend({
  branch: z.string().trim().min(1).max(255),
  fetch_type: z.literal("github_repository"),
  is_enabled: z.boolean(),
  /**
   * 許可リスト外のライセンスはここで 400 になる
   */
  license_spdx: allowedLicenseSchema,
  public_url_strip_prefix: nullableTextSchema,
  public_url_template: webUrlSchema
    .refine((value) => value.includes("{path}"), { message: "Must include {path}" })
    .nullable(),
  repository: githubRepositorySchema,
})

/**
 * サイトのページを取得するソースの入力（ローカルの URL から追加だけが使う）。is_enabled は受け取らない
 */
const websiteInputSchema = sourceInputBaseSchema.extend({
  content_selector: nullableTextSchema,
  exclude_selectors: z.array(z.string().trim().min(1).max(200)).max(20),
  fetch_type: z.literal("website"),
  license_spdx: sourceLicenseSchema,
  site_url: httpsOriginSchema,
})

type SourceInput =
  | z.infer<typeof githubRepositoryInputSchema>
  | z.infer<typeof websiteInputSchema>

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
 * 取得方法ごとの、フィールドをまたぐ検証
 */
const validateSourceInput = (value: SourceInput, ctx: z.RefinementCtx): void => {
  /**
   * github: glob はリポジトリ内の相対パスなので "/" で始めない。website: glob は URL のパスなので "/" で始める
   */
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

  if (value.fetch_type === "github_repository") {
    if (!isRepositoryFileUrl(value.license_url, value.repository)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Must be a file URL in the repository (https://github.com/{owner}/{repo}/blob/...)",
        path: ["license_url"],
      })
    }
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
    public_url_strip_prefix: z.string().nullable(),
    public_url_template: z.string().nullable(),
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

// ========================================================
// GET /api/admin/source - ソース一覧
// ========================================================

/**
 * ソース一覧のレスポンススキーマ。repository / site_url は取得方法でないほうが null
 */
export const getSourceListResponseSchema = z.object({
  sources: z.array(
    z.object({
      id: z.number().int(),
      fetch_type: z.enum(SOURCE_FETCH_TYPES),
      is_enabled: z.boolean(),
      kind: z.enum(SOURCE_KINDS),
      last_collected_at: z.string().nullable(),
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
 * ソース詳細のレスポンススキーマ
 */
export const getSourceResponseSchema = z.object({
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
  .superRefine(validateSourceInput)

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
 * ソース更新のリクエストスキーマ（GitHub は有効 / 無効の切り替えを含む）。取得方法の変更は service が 400 にする
 */
export const updateSourceRequestSchema = z
  .discriminatedUnion("fetch_type", [githubRepositoryInputSchema, websiteInputSchema])
  .superRefine(validateSourceInput)

/**
 * ソース更新のレスポンススキーマ
 */
export const updateSourceResponseSchema = sourceSchema

export type UpdateSourcePathParam = z.infer<typeof updateSourcePathParamSchema>
export type UpdateSourceRequest = z.infer<typeof updateSourceRequestSchema>
export type UpdateSourceResponse = z.infer<typeof updateSourceResponseSchema>

// ========================================================
// GET /api/admin/source/license?repository=owner/name - 検出ライセンスの取得
// ========================================================

/**
 * 検出ライセンス取得のクエリ文字列スキーマ
 */
export const detectSourceLicenseQueryStringSchema = z.object({
  repository: githubRepositorySchema,
})

/**
 * 検出ライセンス取得のレスポンススキーマ。license_spdx が null なのは GitHub がライセンスを判定できなかったとき（ファイルはあっても種類が分からない・複数ある）、
 * license_url（GitHub が見つけたライセンスのファイルの URL）が null なのはライセンスのファイルが無いとき
 */
export const detectSourceLicenseResponseSchema = z.object({
  is_allowed: z.boolean(),
  license_spdx: z.string().nullable(),
  license_url: z.string().nullable(),
})

export type DetectSourceLicenseQueryString = z.infer<typeof detectSourceLicenseQueryStringSchema>
export type DetectSourceLicenseResponse = z.infer<typeof detectSourceLicenseResponseSchema>
