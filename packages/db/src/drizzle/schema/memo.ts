import { pgTable, serial, text, varchar } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"

/**
 * メモ
 */
export const memos = pgTable("memos", {
  id: serial("id").primaryKey(),
  body: text("body").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  ...timestamps,
})
