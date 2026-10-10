/**
 * ソースの種別。問題一覧の絞り込みに使う
 *
 * - docs: 公式ドキュメント
 * - github: README / RFC などリポジトリそのものの文書
 */
export const SOURCE_KINDS = ["docs", "github"] as const

/**
 * ソースの取得方法
 *
 * - github_repository: GitHub リポジトリの Markdown
 * - website: 公式ドキュメントのサイト（HTML）のクロール
 */
export const SOURCE_FETCH_TYPES = ["github_repository", "website"] as const

/**
 * 登録を許可するライセンス（SPDX 識別子）。
 * ShareAlike（CC-BY-SA-*）・コピーレフト（GPL-*）・NonCommercial（CC-BY-NC-*）は入れない
 */
export const ALLOWED_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "CC-BY-4.0",
  "PSF-2.0",
  "CC0-1.0",
  "Unlicense",
] as const
