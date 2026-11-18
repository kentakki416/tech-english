import { timestamp } from "drizzle-orm/pg-core"

/**
 * `created_at` の default（`now()`）は UTC で評価される（client がセッションのタイムゾーンを UTC に固定している）。
 * `updated_at` は DB の default を持たず、Drizzle が insert / update のたびに現在時刻を入れる。
 */
export const timestamps = {
  createdAt: timestamp("created_at", { mode: "date", precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).notNull().$onUpdate(() => new Date()),
}
