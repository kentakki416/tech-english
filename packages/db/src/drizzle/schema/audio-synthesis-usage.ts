import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, pgTable, serial } from "drizzle-orm/pg-core"

import { timestamps } from "./columns"
import { passages } from "./passage"

/**
 * 読み上げの音声合成（Amazon Polly の SynthesizeSpeech）で課金された文字数の記録。追記だけで、更新・削除しない。
 * generate:audio が音声と単語の時刻のリクエストごとに 1 行書き、今月（UTC の暦月）の合計で AUDIO_MONTHLY_CHARACTER_LIMIT を超えないようにする。
 * 列の正本は docs/spec/read-aloud/README.md の「必要な DB 設計」。制約・index 名は Prisma の既定の命名に合わせている。
 */
export const audioSynthesisUsages = pgTable(
  "audio_synthesis_usages",
  {
    id: serial("id").primaryKey(),
    /**
     * 課金された文字数（Polly の RequestCharacters）
     */
    characters: integer("characters").notNull(),
    passageId: integer("passage_id").notNull(),
    ...timestamps,
  },
  (table) => [
    check("audio_synthesis_usages_characters_check", sql`${table.characters} > 0`),
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
     * 今月の合計の集計用
     */
    index("audio_synthesis_usages_created_at_idx").on(table.createdAt),
  ],
)
