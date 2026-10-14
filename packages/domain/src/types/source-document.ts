/**
 * 取得した文書（GitHub のファイル / サイトのページ）。
 * 差分検出・出典の組み立て・サイトのクロールの待ち行列に使う。取得方法ごとの項目はすべて nullable
 */
export type SourceDocument = {
  id: number
  /**
   * GitHub のみ。ファイルの blob SHA（変更の検出に使う）
   */
  blobSha: string | null
  /**
   * GitHub のみ。取得したときのコミット
   */
  commitSha: string | null
  /**
   * 抽出した本文のハッシュ
   */
  contentHash: string | null
  /**
   * サイトのみ。レスポンスの ETag
   */
  etag: string | null
  /**
   * 最後に取得を試みた時刻。null は未取得。
   * サイトは取得できなかったとき（ネットワークエラー・429 / 503）も試した時刻を入れる（待ち行列から外すため）
   */
  fetchedAt: Date | null
  /**
   * サイトのみ。最後に取得したときの HTTP ステータス
   */
  httpStatus: number | null
  /**
   * サイトのみ。レスポンスの Last-Modified ヘッダの値をそのまま保存する
   */
  lastModified: string | null
  /**
   * GitHub はリポジトリ内のファイルパス、サイトは URL のパス
   */
  path: string
  /**
   * サイトのみ。sitemap の lastmod
   */
  sitemapLastmod: Date | null
  sourceId: number
  title: string | null
  createdAt: Date
  updatedAt: Date
}
