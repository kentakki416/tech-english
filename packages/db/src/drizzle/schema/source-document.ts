import { foreignKey, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"
import { sources } from "./source"

/**
 * 取得した文書（GitHub のファイル / URL から追加で取り込んだサイトのページ）。差分検出・出典の組み立てに使う
 *
 * 取得方法ごとの列は nullable。制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: serial("id").primaryKey(),
    /**
     * GitHub のみ。ファイルの blob SHA（変更の検出に使う）
     */
    blobSha: text("blob_sha"),
    /**
     * GitHub のみ。取得したときのコミット
     */
    commitSha: text("commit_sha"),
    /**
     * 抽出した本文のハッシュ
     */
    contentHash: text("content_hash"),
    /**
     * 文書を切り分けたときの抽出の版（cron の EXTRACTION_VERSION）。NULL はこの列を足してから一度も切り分けていない文書
     */
    extractionVersion: text("extraction_version"),
    /**
     * 最後に取得した時刻。NULL は未取得
     */
    fetchedAt: timestamp("fetched_at", { mode: "date", precision: 3 }),
    /**
     * GitHub はリポジトリ内のファイルパス、サイトは URL のパス
     */
    path: text("path").notNull(),
    sourceId: integer("source_id").notNull(),
    title: text("title"),
    ...timestamps,
  },
  (table) => [
    /**
     * ソースを削除する機能は無く、問題が出典として参照し続けるため restrict
     */
    foreignKey({
      columns: [table.sourceId],
      foreignColumns: [sources.id],
      name: "source_documents_source_id_fkey",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    uniqueIndex("source_documents_source_id_path_key").on(table.sourceId, table.path),
  ],
)
