export interface MemoRepository {
  /**
   * `threshold` より前に作成された memo をすべて削除し、削除件数を返す。
   */
  deleteOlderThan(threshold: Date): Promise<number>
}
