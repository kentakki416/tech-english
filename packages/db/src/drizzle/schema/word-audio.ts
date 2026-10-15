import { sql } from "drizzle-orm"
import { check, index, integer, pgTable, serial, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { AUDIO_STATUSES } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"

/**
 * 見出し語ごとの発音の音声（1 語 1 行）。列の正本は docs/spec/vocabulary-pronunciation/README.md の「必要な DB 設計」。
 * ユーザーに紐づかないので、アカウント削除の cascade の対象外。問題の却下でも消さない（単語の発音は本文ではないため）。
 */
export const wordAudios = pgTable(
  "word_audios",
  {
    id: serial("id").primaryKey(),
    /**
     * mp3 の保存キー（words/{text_hash}.mp3）。最後に成功した生成のもの。失敗しても前の値を残す（voice の変更で前の mp3 を消すため）
     */
    audioKey: text("audio_key"),
    attemptCount: smallint("attempt_count").notNull().default(0),
    /**
     * Polly の課金文字数（mp3 の 1 リクエスト分）。最後に成功した生成の分
     */
    billedCharacters: integer("billed_characters").notNull().default(0),
    generatedAt: timestamp("generated_at", { mode: "date", precision: 3 }),
    /**
     * 生成タスクが確保した時刻（確保のトークン）。結果の書き込みの条件と、30 分以上止まった確保の回収に使う。
     * generating の行と、ready のまま確保した行（voice の変更）が値を持つ
     */
    generationStartedAt: timestamp("generation_started_at", { mode: "date", precision: 3 }),
    lastError: text("last_error"),
    /**
     * 正規化した見出し語（vocabulary_cards.lemma と同じ。前後の空白なし・小文字）
     */
    lemma: text("lemma").notNull(),
    status: text("status", { enum: AUDIO_STATUSES }).notNull().default("pending"),
    /**
     * voice と見出し語のハッシュ。audio_key と同じく最後に成功した生成のもの
     */
    textHash: text("text_hash"),
    /**
     * 確保したとき（作ろうとしたとき）の voice。ready の行は audio_key を作った voice
     */
    voiceId: text("voice_id").notNull(),
    ...timestamps,
  },
  (table) => [
    check("word_audios_status_check", sql`${table.status} IN (${joinSqlValues(AUDIO_STATUSES)})`),
    check("word_audios_attempt_count_check", sql`${table.attemptCount} >= 0`),
    /**
     * vocabulary_cards.lemma と同じ正規化（前後の空白なし・小文字・1〜200 文字）
     */
    check(
      "word_audios_lemma_check",
      sql`${table.lemma} = lower(btrim(${table.lemma})) AND char_length(${table.lemma}) BETWEEN 1 AND 200`,
    ),
    /**
     * ready なら mp3 のキー・ハッシュ・作成日時が必ずある（api はこれを前提に URL を組み立てる）
     */
    check(
      "word_audios_ready_columns_check",
      sql`${table.status} <> 'ready' OR (${table.audioKey} IS NOT NULL AND ${table.textHash} IS NOT NULL AND ${table.generatedAt} IS NOT NULL)`,
    ),
    /**
     * generating なら確保した時刻が必ずある（結果の書き込みの条件と 30 分の回収に使う）
     */
    check(
      "word_audios_generating_columns_check",
      sql`${table.status} <> 'generating' OR ${table.generationStartedAt} IS NOT NULL`,
    ),
    uniqueIndex("word_audios_lemma_key").on(table.lemma),
    /**
     * 生成タスクの取得用
     */
    index("word_audios_status_idx").on(table.status),
  ],
)
