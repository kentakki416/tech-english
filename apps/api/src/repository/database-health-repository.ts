/**
 * データベースのヘルスチェック用リポジトリのインターフェース
 */
export interface DatabaseHealthRepository {
  ping(): Promise<void>
}
