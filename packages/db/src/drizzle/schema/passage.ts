import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { PASSAGE_DIFFICULTIES, PASSAGE_STATUSES, type PassageBlock, type PassageDifficulty } from "@repo/domain"

import { timestamps } from "./columns"
import { sourceDocuments } from "./source-document"
import { joinSqlValues } from "./sql-values"

/**
 * 本文候補 / 問題。状態（status）で収集から公開までを表す。物理削除しない（挑戦記録が参照するため）
 *
 * 列の正本は docs/spec/question-generation/README.md の「必要な DB 設計」。
 * source_path / source_commit_sha / source_retrieved_at を source_documents と別に持つのは、
 * source_documents が次回の収集で最新の状態に上書きされても、問題が取得した時点を指し続けるため。
 * 制約・index 名は `{table}_{columns}_key` / `_idx` / `_fkey` の命名にそろえている。
 */
export const passages = pgTable(
  "passages",
  {
    id: serial("id").primaryKey(),
    /**
     * 要確認の理由
     */
    attentionReasons: jsonb("attention_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    blocks: jsonb("blocks").$type<PassageBlock[]>().notNull(),
    /**
     * 本文の正規化テキストの SHA-256。同じ内容の再取り込みを unique 制約で弾く
     */
    contentHash: text("content_hash").notNull(),
    /**
     * 生成するまでは NULL
     */
    difficulty: smallint("difficulty").$type<PassageDifficulty>(),
    generatedAt: timestamp("generated_at", { mode: "date", precision: 3 }),
    generationAttemptCount: integer("generation_attempt_count").notNull().default(0),
    generationError: text("generation_error"),
    generationModel: text("generation_model"),
    /**
     * 生成を優先した時刻（URL から取り込んだとき）。生成タスクはこの値がある本文候補を古い順に先に取る。生成した後も残す
     */
    generationPrioritizedAt: timestamp("generation_prioritized_at", { mode: "date", precision: 3 }),
    generationPromptVersion: text("generation_prompt_version"),
    generationStartedAt: timestamp("generation_started_at", { mode: "date", precision: 3 }),
    needsAttention: boolean("needs_attention").notNull().default(false),
    publishedAt: timestamp("published_at", { mode: "date", precision: 3 }),
    rejectReason: text("reject_reason"),
    reviewedAt: timestamp("reviewed_at", { mode: "date", precision: 3 }),
    /**
     * 取得時のコミット。GitHub のみ
     */
    sourceCommitSha: text("source_commit_sha"),
    sourceDocumentId: integer("source_document_id").notNull(),
    /**
     * 取得時のファイルパス or URL のパス
     */
    sourcePath: text("source_path").notNull(),
    sourceRetrievedAt: timestamp("source_retrieved_at", { mode: "date", precision: 3 }).notNull(),
    status: text("status", { enum: PASSAGE_STATUSES }).notNull().default("collected"),
    timeLimitSeconds: integer("time_limit_seconds"),
    title: text("title").notNull(),
    wordCount: integer("word_count").notNull(),
    ...timestamps,
  },
  (table) => [
    check("passages_status_check", sql`${table.status} IN (${joinSqlValues(PASSAGE_STATUSES)})`),
    /**
     * NULL は CHECK を通る（生成前）
     */
    check("passages_difficulty_check", sql`${table.difficulty} IN (${joinSqlValues(PASSAGE_DIFFICULTIES)})`),
    /**
     * passages は物理削除しないので restrict
     */
    foreignKey({
      columns: [table.sourceDocumentId],
      foreignColumns: [sourceDocuments.id],
      name: "passages_source_document_id_fkey",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    uniqueIndex("passages_content_hash_key").on(table.contentHash),
    /**
     * 生成タスクの取得と一覧
     */
    index("passages_status_created_at_idx").on(table.status, table.createdAt),
    /**
     * ソースごとの件数集計で source_documents と結合する
     */
    index("passages_source_document_id_idx").on(table.sourceDocumentId),
  ],
)
