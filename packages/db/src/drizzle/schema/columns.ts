import { timestamp } from "drizzle-orm/pg-core"

/**
 * 全テーブル共通の作成・更新日時。テーブル定義の末尾で `...timestamps` と展開する。
 *
 * 型は Prisma のマイグレーションに合わせて `TIMESTAMP(3)` にしている（併存中の Prisma 実装が同じ列を読むため）。
 * `created_at` の default（`now()`）は UTC で評価される（client がセッションのタイムゾーンを UTC に固定している）。
 * `updated_at` は DB の default を持たず、Drizzle が insert / update のたびに現在時刻を入れる。
 */
export const timestamps = {
  createdAt: timestamp("created_at", { mode: "date", precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).notNull().$onUpdate(() => new Date()),
}
