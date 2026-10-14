import type { Memo } from "@repo/domain"

/**
 * worker 側で必要な memo 操作の interface。
 *
 * apps/api / apps/cron の MemoRepository とは意図的に分離している。
 * 各 app は必要な操作のみを持つ独自 interface を定義する方針。
 *
 * 戻り値は Drizzle の型ではなく `@repo/domain` の domain 型にする。
 * 永続化の型を契約に出すと jobs 配下の業務ロジックが永続化モデルに型付けされてしまうため。
 */
export interface MemoRepository {
  findById(id: number): Promise<Memo | null>
}
