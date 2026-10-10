/**
 * cron 側 (cleanup batch) で必要な memo 操作のインターフェース
 *
 * apps/api 側の MemoRepository と意図的に分離している:
 *   - api 側は CRUD ベース（findAll / findById / create / update / deleteById）
 *   - cron 側は一括削除など batch 系の操作だけ持つ
 * 共有 interface を作ると不要なメソッドが両方に漏れ出すため、それぞれの app で必要な
 * 操作のみを持つ独自 interface とする方針。
 *
 * 実装は Prisma（`./prisma`）と Drizzle（`./drizzle`）の 2 つがあり、どちらを使うかは
 * `src/task/` の DI で決める。
 */
export interface MemoRepository {
  /**
   * `threshold` より前に作成された memo をすべて削除し、削除件数を返す。
   */
  deleteOlderThan(threshold: Date): Promise<number>
}
