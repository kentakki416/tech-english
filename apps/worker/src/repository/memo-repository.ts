import type { Memo } from "@repo/domain"

/**
 * apps/api / apps/cron の MemoRepository と共有しない。共有すると、worker が使わない操作まで持つことになる。
 *
 * 戻り値は Drizzle の型ではなく `@repo/domain` の型にする。
 * Drizzle の型を出すと、jobs のハンドラが DB の行の型に依存する。
 */
export interface MemoRepository {
  findById(id: number): Promise<Memo | null>
}
