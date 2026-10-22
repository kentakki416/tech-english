/**
 * 取得した文書（GitHub のファイル / URL から追加で取り込んだサイトのページ）。
 * 差分検出・出典の組み立てに使う。取得方法ごとの項目はすべて nullable
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
   * 文書を切り分けたときの抽出の版（cron の EXTRACTION_VERSION）。null はこの列を足してから一度も切り分けていない文書
   */
  extractionVersion: string | null
  /**
   * 最後に取得した時刻。null は未取得
   */
  fetchedAt: Date | null
  /**
   * GitHub はリポジトリ内のファイルパス、サイトは URL のパス
   */
  path: string
  sourceId: number
  title: string | null
  createdAt: Date
  updatedAt: Date
}
