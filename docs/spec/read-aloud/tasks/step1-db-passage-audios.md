# step1-db-passage-audios

読み上げの音声を問題ごとに持つ `passage_audios` と、解答中に聞いた段落の数 `reading_attempts.listened_block_count` を作る。あわせて `@repo/domain` に `AUDIO_STATUSES` と音声のマニフェストの型（`PassageAudioManifest`）を置く。列の定義と意味は [README の必要な DB 設計](../README.md#必要な-db-設計)。

## 前提

- [content-collection step1-db-content-sources](../../content-collection/tasks/step1-db-content-sources.md)（`passages`。`passage_audios.passage_id` の参照先）
- [reading-practice step1-db-reading-attempts](../../reading-practice/tasks/step1-db-reading-attempts.md)（`reading_attempts` と domain の `ReadingAttempt`）
- 実装の順番は [reading-practice step4-api-attempt-submit](../../reading-practice/tasks/step4-api-attempt-submit.md)・[step6-web-attempt](../../reading-practice/tasks/step6-web-attempt.md)・[step7-web-result](../../reading-practice/tasks/step7-web-result.md) と [learning-record step2-api-user-stats](../../learning-record/tasks/step2-api-user-stats.md) の後（[README の実装ステップ](../README.md#実装ステップ予定)）
- 文字位置（`startOffset` / `endOffset`）の定義は [question-generation step1-db-questions](../../question-generation/tasks/step1-db-questions.md) と同じ（`PassageBlock.text` 上の UTF-16 の index、`[start, end)`）

## 対応内容

### 1. `@repo/domain`

```ts
/** packages/domain/src/const/audio.ts */
/**
 * 読み上げの音声の状態（README「音声ができるまで」）。generating は生成タスクが確保している間
 */
export const AUDIO_STATUSES = ["pending", "generating", "ready", "failed"] as const
```

```ts
/** packages/domain/src/types/audio.ts */
export type AudioStatus = (typeof AUDIO_STATUSES)[number]

/**
 * 単語 1 つの時刻と位置。容量を抑えるためオブジェクトにせずタプルにする（600 語で約 20KB）。
 * offset は PassageBlock.text（バッククォートを含む元の本文）上の UTF-16 の index で、endOffset は含まない
 */
export type AudioWordTiming = [startMs: number, endMs: number, startOffset: number, endOffset: number]

/**
 * 1 回の音声合成で作った mp3。ふつうは 1 ブロック 1 パート。3,000 文字を超えるブロックだけ複数になる
 */
export type PassageAudioPart = {
  durationMs: number
  /** Storage のキー（passages/{passage_id}/{text_hash}/{block_index}-{part}.mp3）。URL は api が組み立てる */
  key: string
  words: AudioWordTiming[]
}

export type PassageAudioManifest = {
  /** 読み上げるブロックだけ（code のブロックは含まない）。blockIndex の昇順 */
  blocks: { blockIndex: number; parts: PassageAudioPart[] }[]
}

export type PassageAudio = {
  id: number
  attemptCount: number
  /** Polly の課金文字数（音声 + 単語の時刻）。最後に成功した生成の分 */
  billedCharacters: number
  generatedAt: Date | null
  /** generating にした時刻（確保のトークン）。generating 以外では null */
  generationStartedAt: Date | null
  lastError: string | null
  /** 最後に成功した生成のマニフェスト。まだ成功していなければ null */
  manifest: PassageAudioManifest | null
  passageId: number
  status: AudioStatus
  /** manifest を作った本文のハッシュ（manifest が無い行は作ろうとした本文のハッシュ） */
  textHash: string
  voiceId: string
  createdAt: Date
  updatedAt: Date
}
```

- `src/rules/audio.ts` に Prisma 実装の `_toDomain()` で使う type guard `isAudioStatus(value: string): value is AudioStatus` を置く（`isPassageStatus` と同じ書き方）
- `src/types/attempt.ts` の `ReadingAttempt` に `listenedBlockCount: number` を足す（キーはアルファベット順で `isOvertime` の後）
- `src/index.ts` に名前を列挙して re-export を足す（ファイル名順）：`AUDIO_STATUSES`、`isAudioStatus`、`AudioStatus` / `AudioWordTiming` / `PassageAudio` / `PassageAudioManifest` / `PassageAudioPart`

### 2. Drizzle のスキーマ

```ts
/** packages/db/src/drizzle/schema/passage-audio.ts */
/**
 * 問題ごとの読み上げの音声（1 問 1 行）。列の正本は docs/spec/read-aloud/README.md の「必要な DB 設計」。
 * ユーザーに紐づかないので、アカウント削除の cascade の対象外
 */
export const passageAudios = pgTable(
  "passage_audios",
  {
    id: serial("id").primaryKey(),
    attemptCount: smallint("attempt_count").notNull().default(0),
    billedCharacters: integer("billed_characters").notNull().default(0),
    generatedAt: timestamp("generated_at", { mode: "date", precision: 3 }),
    generationStartedAt: timestamp("generation_started_at", { mode: "date", precision: 3 }),
    lastError: text("last_error"),
    manifest: jsonb("manifest").$type<PassageAudioManifest>(),
    passageId: integer("passage_id").notNull(),
    status: text("status", { enum: AUDIO_STATUSES }).notNull().default("pending"),
    textHash: text("text_hash").notNull(),
    voiceId: text("voice_id").notNull(),
    ...timestamps,
  },
  (table) => [
    check("passage_audios_status_check", sql`${table.status} IN (${joinSqlValues(AUDIO_STATUSES)})`),
    check("passage_audios_attempt_count_check", sql`${table.attemptCount} >= 0`),
    /** ready ならマニフェストと作成日時が必ずある（api はこれを前提に URL を組み立てる） */
    check("passage_audios_ready_columns_check", sql`${table.status} <> 'ready' OR (${table.manifest} IS NOT NULL AND ${table.generatedAt} IS NOT NULL)`),
    /** generating なら確保した時刻が必ずある（結果の書き込みの条件と 30 分の回収に使う） */
    check("passage_audios_generating_columns_check", sql`${table.status} <> 'generating' OR ${table.generationStartedAt} IS NOT NULL`),
    foreignKey({ columns: [table.passageId], foreignColumns: [passages.id], name: "passage_audios_passage_id_fkey" })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("passage_audios_passage_id_key").on(table.passageId),
    /** 生成タスクの取得用 */
    index("passage_audios_status_idx").on(table.status),
  ],
)
```

- `reading-attempt.ts` に `listenedBlockCount: smallint("listened_block_count").notNull().default(0)` を足す（`isOvertime` の後。既存の行は 0 になる）
- `schema/index.ts` に `export * from "./passage-audio"` を足す（ファイル名順）
- `packages/db/src/index.ts` の Prisma 型の re-export に `PassageAudio` を足す（アルファベット順）

### 3. マイグレーション

```bash
pnpm --filter @repo/domain build
pnpm --filter api db:generate
```

生成された SQL を目で確認する：`passage_audios` の CHECK 4 つ（status の値が定数どおり）、`passage_id` の unique index と `ON DELETE CASCADE`、`(status)` の index、`reading_attempts` への `ADD COLUMN "listened_block_count" smallint DEFAULT 0 NOT NULL`。

### 4. `schema.prisma`

```prisma
// 問題ごとの読み上げの音声（read-aloud）。CHECK 制約は Drizzle のマイグレーションが正本
model PassageAudio {
    id               Int       @id @default(autoincrement())
    passageId        Int       @unique @map("passage_id")
    /// AUDIO_STATUSES
    status           String    @default("pending")
    voiceId          String    @map("voice_id")
    textHash         String    @map("text_hash")
    /// PassageAudioManifest
    manifest         Json?
    billedCharacters Int       @default(0) @map("billed_characters")
    attemptCount     Int       @default(0) @map("attempt_count") @db.SmallInt
    lastError        String?   @map("last_error")
    /// generating にした時刻（確保のトークン）
    generationStartedAt DateTime? @map("generation_started_at")
    generatedAt      DateTime? @map("generated_at")
    createdAt        DateTime  @default(now()) @map("created_at")
    updatedAt        DateTime  @updatedAt @map("updated_at")

    passage Passage @relation(fields: [passageId], references: [id], onDelete: Cascade)

    @@index([status])
    @@map("passage_audios")
}
```

- `Passage` に `audio PassageAudio?`、`ReadingAttempt` に `listenedBlockCount Int @default(0) @map("listened_block_count") @db.SmallInt` を足す
- `unique` の名前は Prisma の既定（`passage_audios_passage_id_key`）と Drizzle の名前を一致させている

### 5. 既存の Repository への影響（reading-practice / learning-record）

`ReadingAttempt` に列が増えるので、型エラーになった箇所を直す（この step では値の読み書きの仕様は変えない。提出で値を入れるのは [step4](./step4-api-attempt-audio.md)）。

- api の `ReadingAttemptRepository` の Prisma 実装の `_toDomain()` に `listenedBlockCount` を足す。Drizzle 実装は列を明示して select していれば足す（行をそのまま返していれば不要）
- テストの fixture（`ReadingAttempt` を組み立てている Service のユニットテスト）に `listenedBlockCount: 0` を足す

## 動作確認

```bash
pnpm --filter @repo/domain build && pnpm --filter @repo/domain test
pnpm --filter api db:generate      # 生成された SQL を確認
pnpm --filter api db:migrate
pnpm --filter @repo/db prisma:generate
pnpm build && pnpm lint:fix
pnpm --filter api test             # 既存のテストが通る（マイグレーションが test DB に流れる）
```

`packages/domain/test/rules/audio.test.ts`：

- [ ] `isAudioStatus`：`pending` / `generating` / `ready` / `failed` は true、`collected`・空文字は false

psql で制約を確かめる（`published` の問題を 1 件用意する）：

- [ ] `passage_audios` に `status = 'collected'` を入れると CHECK 違反
- [ ] `status = 'generating'` で `generation_started_at` が NULL の行は CHECK 違反。値があれば入る
- [ ] `status = 'ready'` で `manifest` が NULL の行は CHECK 違反。`manifest` と `generated_at` があれば入る
- [ ] 同じ `passage_id` の 2 行目は unique 違反
- [ ] `attempt_count = -1` は CHECK 違反
- [ ] `passages` の行を消すと `passage_audios` の行も消える（ふだん `passages` は物理削除しないが、FK の動きを確かめる）
- [ ] 既存の `reading_attempts` の行の `listened_block_count` が 0
