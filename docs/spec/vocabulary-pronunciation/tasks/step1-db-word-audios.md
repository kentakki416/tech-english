# step1-db-word-audios

見出し語ごとの発音の音声 `word_audios` を足し、課金文字数の記録 `audio_synthesis_usages` を単語の音声でも使えるようにする（`passage_id` を nullable にし、`word_audio_id` を足す）。

## 前提

- read-aloud の [step1-db-passage-audios](../../read-aloud/tasks/step1-db-passage-audios.md)（`passage_audios`・`audio_synthesis_usages`、`@repo/domain` の `AUDIO_STATUSES`）
- vocabulary-cards の [step1-db-vocabulary-cards](../../vocabulary-cards/tasks/step1-db-vocabulary-cards.md)（`normalizeVocabularyLemma`）
- 列の意味は README の [必要な DB 設計](../README.md#必要な-db-設計)

## 対応内容

### 1. `@repo/domain`

`src/types/audio.ts` に `WordAudio` を足し、`src/index.ts` の `export type { ... } from "./types/audio"` に加える（名前順）。

```typescript
/** packages/domain/src/types/audio.ts */

/**
 * 見出し語ごとの発音の音声（1 語 1 行）。ユーザーに紐づかない
 */
export type WordAudio = {
  id: number
  /**
   * mp3 の保存キー（words/{textHash}.mp3）。ready なら必ずある。失敗しても前の値を残す（voice の変更で前の mp3 を消すため）
   */
  audioKey: string | null
  attemptCount: number
  /**
   * 最後に成功した生成の課金文字数（mp3 の 1 リクエスト分）
   */
  billedCharacters: number
  generatedAt: Date | null
  /**
   * 生成タスクが確保した時刻（確保のトークン）。generating の行と、ready のまま確保した行（voice の変更）が値を持つ
   */
  generationStartedAt: Date | null
  lastError: string | null
  /**
   * 正規化した見出し語（normalizeVocabularyLemma。vocabulary_cards.lemma と同じ）
   */
  lemma: string
  status: AudioStatus
  /**
   * voice_id と見出し語のハッシュ（保存キーに使う）。audioKey と同じく最後に成功した生成のもの
   */
  textHash: string | null
  voiceId: string
  createdAt: Date
  updatedAt: Date
}
```

### 2. Drizzle のスキーマ

`packages/db/src/drizzle/schema/word-audio.ts` を新設し、`schema/index.ts` に足す（ファイル名順）。制約は `passage_audios` にそろえる。

```typescript
/** packages/db/src/drizzle/schema/word-audio.ts */
import { sql } from "drizzle-orm"
import { check, index, integer, pgTable, serial, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { AUDIO_STATUSES } from "@repo/domain"

import { timestamps } from "./columns"
import { joinSqlValues } from "./sql-values"

/**
 * 見出し語ごとの発音の音声（1 語 1 行）。列の正本は docs/spec/vocabulary-pronunciation/README.md の「必要な DB 設計」。
 * ユーザーに紐づかないので、アカウント削除の cascade の対象外。問題の却下でも消さない
 */
export const wordAudios = pgTable(
  "word_audios",
  {
    id: serial("id").primaryKey(),
    audioKey: text("audio_key"),
    attemptCount: smallint("attempt_count").notNull().default(0),
    billedCharacters: integer("billed_characters").notNull().default(0),
    generatedAt: timestamp("generated_at", { mode: "date", precision: 3 }),
    generationStartedAt: timestamp("generation_started_at", { mode: "date", precision: 3 }),
    lastError: text("last_error"),
    lemma: text("lemma").notNull(),
    status: text("status", { enum: AUDIO_STATUSES }).notNull().default("pending"),
    textHash: text("text_hash"),
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
     * ready なら mp3 のキーと作成日時が必ずある（api はこれを前提に URL を組み立てる）
     */
    check(
      "word_audios_ready_columns_check",
      sql`${table.status} <> 'ready' OR (${table.audioKey} IS NOT NULL AND ${table.textHash} IS NOT NULL AND ${table.generatedAt} IS NOT NULL)`,
    ),
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
```

`schema/audio-synthesis-usage.ts` を変える。

- `passageId` を nullable にする（`.notNull()` を外す）
- `wordAudioId: integer("word_audio_id")` を足し、`word_audios` への外部キー（`audio_synthesis_usages_word_audio_id_fkey`、`onDelete("restrict")`・`onUpdate("cascade")`。`word_audios` は消さないので課金の記録を残す）
- CHECK `audio_synthesis_usages_target_check`：`num_nonnulls(passage_id, word_audio_id) = 1`（どちらか一方だけ）
- index `audio_synthesis_usages_word_audio_id_idx`（外部キーの削除の確認用）
- テーブルの JSDoc の「generate:audio が」を「generate:audio と generate:word-audio が」にする

### 3. マイグレーション

```bash
pnpm --filter @repo/domain build
pnpm --filter @repo/db db:generate --name add_word_audios
```

生成された SQL を確かめる。

- `word_audios` の作成と、上の CHECK・unique・index
- `audio_synthesis_usages.passage_id` の `DROP NOT NULL`
- `word_audio_id` の追加、外部キー・CHECK・index

既存の行はすべて `passage_id` を持つので、CHECK はそのまま満たす。

### 4. 既存のコードへの影響

- cron の `AudioSynthesisUsageRepository.record` の入力が `{ characters, now, passageId }` のままでも型は通る（`passageId: number` は nullable の列に入る）。単語の音声の記録は step2 で足す
- `test/repository/user-delete-cascade.test.ts`（api）の「アカウント削除で消えるテーブル」には足さない（`word_audios` はユーザーに紐づかない）。ただし「ユーザーに紐づかないテーブルの一覧」があれば足す

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/domain test
pnpm --filter @repo/db db:generate --name add_word_audios   # 生成された SQL を確認
pnpm --filter api db:migrate
pnpm build && pnpm lint:fix
pnpm --filter api test     # 既存のテストが通る（マイグレーションが test DB に流れる）
pnpm --filter cron test    # 既存の generate:audio のテストが通る（課金の記録は passage_id のまま）
```

dev の DB に流し、psql で制約を確かめる（`BEGIN` … `ROLLBACK` で何も残さない）。

- [ ] `word_audios` に `lemma = 'Effect'`（大文字）・`' effect'`（前後の空白）・空文字・201 文字を入れると CHECK で失敗する
- [ ] 同じ `lemma` を 2 行入れると unique で失敗する
- [ ] `status = 'ready'` で `audio_key` が NULL だと失敗する。`status = 'generating'` で `generation_started_at` が NULL だと失敗する
- [ ] `audio_synthesis_usages` に `passage_id` と `word_audio_id` の両方・両方 NULL を入れると CHECK で失敗し、片方だけなら入る
- [ ] `audio_synthesis_usages` から参照されている `word_audios` の行は消せない（restrict）
