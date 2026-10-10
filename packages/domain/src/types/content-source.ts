import type { ALLOWED_LICENSES, SOURCE_FETCH_TYPES, SOURCE_KINDS } from "../const/content-source"

/**
 * ソースの種別
 */
export type SourceKind = (typeof SOURCE_KINDS)[number]

/**
 * ソースの取得方法
 */
export type SourceFetchType = (typeof SOURCE_FETCH_TYPES)[number]

/**
 * 登録を許可するライセンス（SPDX 識別子）
 */
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number]

/**
 * 取得方法によらない共通の項目
 */
type ContentSourceBase = {
  id: number
  /**
   * 除外パス（glob）
   */
  excludeGlobs: string[]
  /**
   * 対象パス（glob）。GitHub はリポジトリ内のファイルパス、サイトは URL のパスに対して判定する
   */
  includeGlobs: string[]
  isEnabled: boolean
  kind: SourceKind
  lastCollectedAt: Date | null
  licenseSpdx: AllowedLicense
  /**
   * ライセンスの記載がある URL
   */
  licenseUrl: string
  /**
   * 表示名
   */
  name: string
  /**
   * 技術タグ
   */
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * GitHub リポジトリの Markdown から取得するソース
 */
export type GitHubRepositorySource = ContentSourceBase & {
  branch: string
  fetchType: "github_repository"
  /**
   * 最後に全ファイルを処理し終えたコミット。未収集・途中で打ち切った場合は前回の値のまま
   */
  lastCollectedCommitSha: string | null
  /**
   * 公開ページの URL を作るときにファイルパスから取り除くプレフィックス
   */
  publicUrlStripPrefix: string | null
  /**
   * 公開ページの URL 規則（例: https://react.dev/{path}）。未設定なら GitHub のファイルへのリンクを出す
   */
  publicUrlTemplate: string | null
  /**
   * owner/name
   */
  repository: string
}

/**
 * 公式ドキュメントのサイトをクロールして取得するソース
 */
export type WebsiteSource = ContentSourceBase & {
  /**
   * 本文の CSS セレクタ。未設定なら自動で本文を推定する
   */
  contentSelector: string | null
  /**
   * 本文の中から取り除く要素の CSS セレクタ
   */
  excludeSelectors: string[]
  fetchType: "website"
  sitemapUrl: string | null
  /**
   * オリジン（https://go.dev）
   */
  siteUrl: string
  /**
   * 開始ページの URL。sitemapUrl とどちらか一方は必ずある
   */
  startUrl: string | null
}

/**
 * 英文の取得元。取得方法（fetchType）ごとに必須の項目が違う
 */
export type ContentSource = GitHubRepositorySource | WebsiteSource
