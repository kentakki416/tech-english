import type { ALLOWED_LICENSES, SOURCE_FETCH_TYPES, SOURCE_KINDS, SOURCE_LICENSES } from "../const/source"

/**
 * ソースの種別
 */
export type SourceKind = (typeof SOURCE_KINDS)[number]

/**
 * ソースの取得方法
 */
export type SourceFetchType = (typeof SOURCE_FETCH_TYPES)[number]

/**
 * 公開してよいライセンス（SPDX 識別子）
 */
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number]

/**
 * ソースに入れられるライセンス。個人の学習用はサイトのソースだけ
 */
export type SourceLicense = (typeof SOURCE_LICENSES)[number]

/**
 * 取得方法によらない共通の項目
 */
type SourceBase = {
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
  /**
   * ライセンスの記載がある URL
   */
  licenseUrl: string
  /**
   * 表示名
   */
  name: string
  createdAt: Date
  updatedAt: Date
}

/**
 * GitHub リポジトリの Markdown から取得するソース
 */
export type GitHubRepositorySource = SourceBase & {
  branch: string
  fetchType: "github_repository"
  /**
   * 最後に全ファイルを処理し終えたコミット。未収集・途中で打ち切った場合は前回の値のまま
   */
  lastCollectedCommitSha: string | null
  /**
   * lastCollectedCommitSha を記録したときの抽出の版（cron の EXTRACTION_VERSION）
   */
  lastCollectedExtractionVersion: string | null
  licenseSpdx: AllowedLicense
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
 * サイトのページを取得するソース（ローカルの URL から追加だけが使う。収集はしない）
 */
export type WebsiteSource = SourceBase & {
  /**
   * 本文の CSS セレクタ。未設定なら自動で本文を推定する
   */
  contentSelector: string | null
  /**
   * 本文の中から取り除く要素の CSS セレクタ
   */
  excludeSelectors: string[]
  fetchType: "website"
  licenseSpdx: SourceLicense
  /**
   * オリジン（https://go.dev）
   */
  siteUrl: string
}

/**
 * 英文の取得元。取得方法（fetchType）ごとに必須の項目が違う
 */
export type Source = GitHubRepositorySource | WebsiteSource

/**
 * 収集できないソースの理由。not_found はソースが無い、website はサイトのソース（収集しない）、disabled は無効のソース
 */
export type SourceNotCollectableReason = "disabled" | "not_found" | "website"

/**
 * ソースを収集できるか。収集できるなら GitHub のソースに絞った値を、できなければ理由を持つ
 */
export type SourceCollectability =
  | { isCollectable: true; source: GitHubRepositorySource }
  | { isCollectable: false; reason: SourceNotCollectableReason }
