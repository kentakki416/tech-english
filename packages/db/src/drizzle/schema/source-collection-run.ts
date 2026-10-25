import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { ACTIVE_SOURCE_COLLECTION_RUN_STATUSES, SOURCE_COLLECTION_RUN_STATUSES } from "@repo/domain"

import { timestamps } from "./columns"
import { sources } from "./source"
import { joinSqlValues } from "./sql-values"

/**
 * 収集（admin の今すぐ収集）の 1 回ごとの状態と結果。api が queued で作り、worker が running にして結果を書く
 * （docs/spec/manual-collection/README.md「収集の実行の記録」）
 */
export const sourceCollectionRuns = pgTable(
  "source_collection_runs",
  {
    id: serial("id").primaryKey(),
    createdPassageCount: integer("created_passage_count"),
    error: text("error"),
    fetchedDocumentCount: integer("fetched_document_count"),
    finishedAt: timestamp("finished_at", { mode: "date", precision: 3 }),
    sourceId: integer("source_id").notNull(),
    startedAt: timestamp("started_at", { mode: "date", precision: 3 }),
    status: text("status", { enum: SOURCE_COLLECTION_RUN_STATUSES }).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "source_collection_runs_status_check",
      sql`${table.status} IN (${joinSqlValues(SOURCE_COLLECTION_RUN_STATUSES)})`,
    ),
    /**
     * running の started_at は worker が結果を書くときのトークンで、時間切れの片付けも started_at で判定するため、無い行を作らせない
     */
    check(
      "source_collection_runs_running_columns_check",
      sql`${table.status} <> 'running' OR ${table.startedAt} IS NOT NULL`,
    ),
    /**
     * 終わった記録（収集中でないもの）は終わった時刻を持つ
     */
    check(
      "source_collection_runs_finished_columns_check",
      sql`${table.status} IN (${joinSqlValues(ACTIVE_SOURCE_COLLECTION_RUN_STATUSES)}) OR ${table.finishedAt} IS NOT NULL`,
    ),
    foreignKey({
      columns: [table.sourceId],
      foreignColumns: [sources.id],
      name: "source_collection_runs_source_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /**
     * 同じソースの収集を 1 つに限る。SELECT で確かめてから INSERT すると、同時に依頼されたときに両方通るため DB で保証する
     */
    uniqueIndex("source_collection_runs_source_id_active_key")
      .on(table.sourceId)
      .where(sql`${table.status} IN (${joinSqlValues(ACTIVE_SOURCE_COLLECTION_RUN_STATUSES)})`),
    index("source_collection_runs_source_id_id_idx").on(table.sourceId, table.id),
  ],
)
