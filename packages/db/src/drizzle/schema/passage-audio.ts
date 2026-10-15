import { sql } from "drizzle-orm"
import {
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

import { AUDIO_STATUSES, type PassageAudioManifest } from "@repo/domain"

import { timestamps } from "./columns"
import { passages } from "./passage"
import { joinSqlValues } from "./sql-values"

/**
 * 問題ごとの読み上げの音声（1 問 1 行）。列の正本は docs/spec/read-aloud/README.md の「必要な DB 設計」。
 * ユーザーに紐づかないので、アカウント削除の cascade の対象外。
 */
export const passageAudios = pgTable(
  "passage_audios",
  {
    id: serial("id").primaryKey(),
    attemptCount: smallint("attempt_count").notNull().default(0),
    /**
     * Polly の課金文字数（音声 + 単語の時刻）。最後に成功した生成の分
     */
    billedCharacters: integer("billed_characters").notNull().default(0),
    generatedAt: timestamp("generated_at", { mode: "date", precision: 3 }),
    /**
     * 生成タスクが確保した時刻（確保のトークン）。結果の書き込みの条件と、30 分以上止まった確保の回収に使う。
     * generating の行と、ready のまま確保した行（voice の変更・admin の作り直し）が値を持つ
     */
    generationStartedAt: timestamp("generation_started_at", { mode: "date", precision: 3 }),
    lastError: text("last_error"),
    /**
     * 最後に成功した生成のマニフェスト。失敗しても前の値を残す（前の mp3 のキーを後で消すため）
     */
    manifest: jsonb("manifest").$type<PassageAudioManifest>(),
    passageId: integer("passage_id").notNull(),
    /**
     * admin が「作り直す」を押した時刻（作り直しの依頼）。生成タスクは本文の hash が同じでも Polly で作り直し、成功したら null に戻す
     */
    regenerateRequestedAt: timestamp("regenerate_requested_at", { mode: "date", precision: 3 }),
    status: text("status", { enum: AUDIO_STATUSES }).notNull().default("pending"),
    /**
     * 読み上げ対象の本文と voice のハッシュ。manifest と同じく最後に成功した生成のもの
     */
    textHash: text("text_hash").notNull(),
    voiceId: text("voice_id").notNull(),
    ...timestamps,
  },
  (table) => [
    check("passage_audios_status_check", sql`${table.status} IN (${joinSqlValues(AUDIO_STATUSES)})`),
    check("passage_audios_attempt_count_check", sql`${table.attemptCount} >= 0`),
    /**
     * ready ならマニフェストと作成日時が必ずある（api はこれを前提に URL を組み立てる）
     */
    check(
      "passage_audios_ready_columns_check",
      sql`${table.status} <> 'ready' OR (${table.manifest} IS NOT NULL AND ${table.generatedAt} IS NOT NULL)`,
    ),
    /**
     * generating なら確保した時刻が必ずある（結果の書き込みの条件と 30 分の回収に使う）
     */
    check(
      "passage_audios_generating_columns_check",
      sql`${table.status} <> 'generating' OR ${table.generationStartedAt} IS NOT NULL`,
    ),
    foreignKey({
      columns: [table.passageId],
      foreignColumns: [passages.id],
      name: "passage_audios_passage_id_fkey",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("passage_audios_passage_id_key").on(table.passageId),
    /**
     * 生成タスクの取得用
     */
    index("passage_audios_status_idx").on(table.status),
  ],
)
