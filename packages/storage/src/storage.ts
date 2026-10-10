/**
 * バイナリ（PNG / SVG 等）を保存して公開 URL を返す汎用ストレージ抽象。
 *
 * 実装は filesystem / S3 / 将来の他バックエンド（GCS 等）を差し替えられる。
 * 「達成カード」のようなドメイン的な意味は **呼び出し側が持ち**（変数名 cardStorage 等）、
 * 本パッケージは特定用途に依存しない generic な storage に保つ。
 */
export interface Storage {
  /**
   * body を key で保存して公開 URL を返す。ContentType は key の拡張子から推定する
   */
  save(key: string, body: Buffer): Promise<string>
  /**
   * 保存済みオブジェクトを削除する。存在しない場合は no-op
   */
  delete(key: string): Promise<void>
}
