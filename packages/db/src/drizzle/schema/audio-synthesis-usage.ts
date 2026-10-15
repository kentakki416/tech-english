import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, pgTable, serial } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"
import { passages } from "./passage"
import { wordAudios } from "./word-audio"

/**
 * 音声合成（Amazon Polly の SynthesizeSpeech）で課金された文字数の記録。追記だけで、更新・削除しない。
 * generate:audio（読み上げ）は音声と単語の時刻のリクエストごと、generate:word-audio（単語の発音）は mp3 のリクエストごとに 1 行書き、
 * 今月（UTC の暦月）の合計（読み上げと単語の発音の合算）で AUDIO_MONTHLY_CHARACTER_LIMIT を超えないようにする。
 * 列の正本は docs/spec/read-aloud/README.md の「必要な DB 設計」（word_audio_id は docs/spec/vocabulary-pronunciation/README.md）。
 */
export const audioSynthesisUsages = pgTable(
  "audio_synthesis_usages",
  {
    id: serial("id").primaryKey(),
    /**
     * 課金された文字数（Polly の RequestCharacters）
     */
    characters: integer("characters").notNull(),
    /**
     * 読み上げの課金のときの問題。単語の発音の課金では null
     */
    passageId: integer("passage_id"),
    /**
     * 単語の発音の課金のときの見出し語の行。読み上げの課金では null
     */
    wordAudioId: integer("word_audio_id"),
    ...timestamps,
  },
  (table) => [
    check("audio_synthesis_usages_characters_check", sql`${table.characters} > 0`),
    /**
     * 読み上げ（passage_id）と単語の発音（word_audio_id）のどちらか一方だけ
     */
    check("audio_synthesis_usages_target_check", sql`num_nonnulls(${table.passageId}, ${table.wordAudioId}) = 1`),
    /**
     * passages は物理削除しないので restrict（課金の記録を残す）
     */
    foreignKey({
      columns: [table.passageId],
      foreignColumns: [passages.id],
      name: "audio_synthesis_usages_passage_id_fkey",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    /**
     * word_audios は消さないので restrict（課金の記録を残す）
     */
    foreignKey({
      columns: [table.wordAudioId],
      foreignColumns: [wordAudios.id],
      name: "audio_synthesis_usages_word_audio_id_fkey",
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    /**
     * 今月の合計の集計用
     */
    index("audio_synthesis_usages_created_at_idx").on(table.createdAt),
    /**
     * word_audios の行の削除の確認（外部キー）用
     */
    index("audio_synthesis_usages_word_audio_id_idx").on(table.wordAudioId),
  ],
)
