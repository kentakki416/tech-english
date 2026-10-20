import type { FetchedPage } from "../client/page-fetcher"

/**
 * ソースの更新日時を含めるのは、ソースの設定（対象パス・本文の CSS セレクタなど）を変えた後に取り直すため
 */
export type UrlImportPageCacheKey = {
  sourceId: number
  sourceUpdatedAt: Date
  url: string
}

/**
 * URL の取り込みで取得・抽出したページを、確認と保存で使い回すために一定時間置くリポジトリ
 */
export interface UrlImportPageCacheRepository {
  /**
   * 置いていない・期限が切れた・形が合わないときは null
   */
  find(key: UrlImportPageCacheKey): Promise<FetchedPage | null>
  save(key: UrlImportPageCacheKey, page: FetchedPage): Promise<void>
}
