# step1-db-questions

`questions` / `passage_glossary_entries` のスキーマとマイグレーション、`@repo/domain` の設問の定数・型と、制限時間・設問数・本文中の位置を求める純関数を作る。`passages` は作らない（content-collection step1 が全列を作る）。

## 前提

- [content-collection step1-db-content-sources](../../content-collection/tasks/step1-db-content-sources.md)：`passages`（全列）、`const/passage.ts`（`PASSAGE_DIFFICULTIES` ほか）、`types/passage.ts`（`Passage` / `PassageBlock`）、`@repo/db` の dependencies への `@repo/domain` 追加
- 列の定義・制約の理由は README の [必要な DB 設計](../README.md#必要な-db-設計)、計算式は [難易度と制限時間](../README.md#難易度と制限時間)

## 対応内容

### 1. `@repo/domain` の定数と型

```typescript
/** packages/domain/src/const/question.ts */
export const QUESTION_TYPES = ["main_idea", "detail", "vocabulary", "inference", "purpose"] as const
export const QUESTION_CHOICE_COUNT = 4
export const MIN_QUESTIONS_PER_PASSAGE = 3
export const MAX_QUESTIONS_PER_PASSAGE = 5

/** packages/domain/src/const/passage.ts（content-collection step1 のファイルに追記） */
/** 難易度ごとの想定 WPM */
export const READING_WPM_BY_DIFFICULTY = { 1: 100, 2: 120, 3: 140 } as const
export const SECONDS_PER_QUESTION = 40
export const TIME_LIMIT_ROUNDING_SECONDS = 30
```

```typescript
/** packages/domain/src/types/question.ts */
export type QuestionType = (typeof QUESTION_TYPES)[number]

export type Question = {
  id: number
  /** 4 つ。表示順のまま（A〜D） */
  choices: string[]
  correctChoiceIndex: number
  evidenceBlockIndex: number
  evidenceQuote: string
  explanationJa: string
  orderIndex: number
  passageId: number
  prompt: string
  /** vocabulary のときだけ。用語集の項目 */
  targetGlossaryEntryId: number | null
  type: QuestionType
  /** 解答キーを見ない検証で検証モデルが選んだ選択肢。検証していない設問は null */
  verificationChoiceIndex: number | null
  createdAt: Date
  updatedAt: Date
}

export type GlossaryEntry = {
  id: number
  blockIndex: number
  /** blocks[blockIndex].text 上の位置。end は含まない */
  endOffset: number
  lemma: string
  meaningJa: string
  noteJa: string | null
  partOfSpeech: string | null
  passageId: number
  startOffset: number
  surface: string
  createdAt: Date
  updatedAt: Date
}
```

- **`verificationChoiceIndex` は README の DB 設計に無い列を足している。** UI 設計の設問タブの「検証モデルの回答」バッジに検証モデルの回答が要るため（`attention_reasons` の文字列から復元しない）
- 文字位置は **`PassageBlock.text`（インラインコードのバッククォートを含む生の文字列）上の UTF-16 の index**、`[startOffset, endOffset)` とする。cron（step3）・api（step5）・reading-practice のセグメント分割がすべてこの定義で読む

### 2. `@repo/domain` の純関数

`rules/passage.ts` は content-collection step1 が `isPassageStatus` / `isPassageDifficulty` で作っている。同じファイルに足す。

```typescript
/** packages/domain/src/rules/passage.ts（既存のファイルに追記） */
export const calculateQuestionCount = (wordCount: number): number => {
  if (wordCount <= 300) return 3
  if (wordCount <= 450) return 4
  return 5
}

/**
 * 浮動小数の誤差で 30 秒ずれないよう、整数だけで計算する
 * ceil((wordCount * 60 / wpm + questionCount * 40) / 30) * 30
 */
export const calculateTimeLimitSeconds = (
  wordCount: number,
  difficulty: PassageDifficulty,
  questionCount: number,
): number => {
  const wpm = READING_WPM_BY_DIFFICULTY[difficulty]
  const numerator = wordCount * 60 + questionCount * SECONDS_PER_QUESTION * wpm
  return Math.ceil(numerator / (wpm * TIME_LIMIT_ROUNDING_SECONDS)) * TIME_LIMIT_ROUNDING_SECONDS
}
```

`rules/passage-text.ts` に、cron の後処理と api の保存・公開の検査が **同じ判定** を使うための関数を置く（実装が 2 か所に分かれると、cron が作った用語集が api の公開の検査で落ちる）。

```typescript
/** packages/domain/src/rules/passage-text.ts */

/**
 * surface を text から探し、前後が英数字でない（単語の途中でない）最初の出現の位置を返す。
 * 大文字小文字は区別する。見つからなければ null
 */
export const findSurfaceRange = (text: string, surface: string): { endOffset: number, startOffset: number } | null

/** 保存済みの位置に、本文と同じ表記で surface があるか */
export const isSurfaceAt = (text: string, entry: Pick<GlossaryEntry, "endOffset" | "startOffset" | "surface">): boolean =>
  text.slice(entry.startOffset, entry.endOffset) === entry.surface

/**
 * 根拠の引用がブロックの本文に含まれるか。バッククォートを除いた文字列同士で比べる
 * （admin のプレビューもバッククォートを除いた本文で引用を探してハイライトする）
 */
export const hasQuote = (text: string, quote: string): boolean

/**
 * ブロックごとの段落番号（1 始まり）。heading と code は数えず null。
 * 設問文の "paragraph 2"、要確認の理由・公開の条件の「段落 2」と対応する
 */
export const numberParagraphs = (blocks: Pick<PassageBlock, "type">[]): (number | null)[]
```

`packages/domain/src/index.ts` に re-export を足す（ファイル名順）。`forTesting` は使わない（すべて公開 API）。

### 3. テスト基盤（domain に無ければ）

`packages/domain` にはまだテストが無い。`vitest` を **devDependencies** に足し（`dependencies` は空のまま）、`apps/cron/vitest.config.ts` と同じ設定（`globals: true`、`include: ["test/**/*.test.ts"]`）と `"test": "vitest run"` を足す。content-collection step1 で入っていればそれを使う。

### 4. Drizzle のスキーマ

FK の書き方は `auth-account.ts`、CHECK の作り方は `packages/db/README.md` に合わせる。

```typescript
/** packages/db/src/drizzle/schema/passage-glossary-entry.ts */
export const passageGlossaryEntries = pgTable(
  "passage_glossary_entries",
  {
    id: serial("id").primaryKey(),
    blockIndex: integer("block_index").notNull(),
    endOffset: integer("end_offset").notNull(),
    lemma: text("lemma").notNull(),
    meaningJa: text("meaning_ja").notNull(),
    noteJa: text("note_ja"),
    partOfSpeech: text("part_of_speech"),
    passageId: integer("passage_id").notNull(),
    startOffset: integer("start_offset").notNull(),
    surface: text("surface").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({ columns: [table.passageId], foreignColumns: [passages.id], name: "passage_glossary_entries_passage_id_fkey" })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("passage_glossary_entries_passage_id_idx").on(table.passageId),
    index("passage_glossary_entries_lemma_idx").on(table.lemma),
    check("passage_glossary_entries_offset_check", sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`),
  ],
)
```

```typescript
/** packages/db/src/drizzle/schema/question.ts */
export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    choices: jsonb("choices").$type<string[]>().notNull(),
    correctChoiceIndex: smallint("correct_choice_index").notNull(),
    evidenceBlockIndex: integer("evidence_block_index").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    explanationJa: text("explanation_ja").notNull(),
    orderIndex: smallint("order_index").notNull(),
    passageId: integer("passage_id").notNull(),
    prompt: text("prompt").notNull(),
    targetGlossaryEntryId: integer("target_glossary_entry_id"),
    type: text("type", { enum: QUESTION_TYPES }).notNull(),
    verificationChoiceIndex: smallint("verification_choice_index"),
    ...timestamps,
  },
  (table) => [
    foreignKey({ columns: [table.passageId], foreignColumns: [passages.id], name: "questions_passage_id_fkey" })
      .onDelete("cascade")
      .onUpdate("cascade"),
    /** 用語集の項目を消したら紐づけだけ外す（公開の検査で「対象語句なし」として検出される） */
    foreignKey({ columns: [table.targetGlossaryEntryId], foreignColumns: [passageGlossaryEntries.id], name: "questions_target_glossary_entry_id_fkey" })
      .onDelete("set null"),
    uniqueIndex("questions_passage_id_order_index_key").on(table.passageId, table.orderIndex),
    check("questions_type_check", sql`${table.type} IN (${sql.join(QUESTION_TYPES.map((type) => sql`${type}`), sql`, `)})`),
    check("questions_correct_choice_index_check", sql`${table.correctChoiceIndex} BETWEEN 0 AND 3`),
    check("questions_target_glossary_entry_check", sql`${table.targetGlossaryEntryId} IS NULL OR ${table.type} = 'vocabulary'`),
  ],
)
```

- `order_index` には範囲の CHECK を付けない（step5 の保存で並べ替えるとき、unique 制約を避けるために一時的に負の値へ退避するため）
- `schema/index.ts` に 2 ファイルを足す（ファイル名順）
- `packages/db/src/index.ts` の Prisma 型の re-export に `PassageGlossaryEntry` / `Question` を足す

### 5. `schema.prisma`

```prisma
model Question {
    id                      Int      @id @default(autoincrement())
    passageId               Int      @map("passage_id")
    orderIndex              Int      @map("order_index") @db.SmallInt
    type                    String
    prompt                  String
    choices                 Json
    correctChoiceIndex      Int      @map("correct_choice_index") @db.SmallInt
    explanationJa           String   @map("explanation_ja")
    evidenceBlockIndex      Int      @map("evidence_block_index")
    evidenceQuote           String   @map("evidence_quote")
    targetGlossaryEntryId   Int?     @map("target_glossary_entry_id")
    verificationChoiceIndex Int?     @map("verification_choice_index") @db.SmallInt
    createdAt               DateTime @default(now()) @map("created_at")
    updatedAt               DateTime @updatedAt @map("updated_at")

    passage             Passage                @relation(fields: [passageId], references: [id], onDelete: Cascade)
    targetGlossaryEntry PassageGlossaryEntry?  @relation("QuestionTarget", fields: [targetGlossaryEntryId], references: [id], onDelete: SetNull)

    @@unique([passageId, orderIndex])
    @@map("questions")
}
```

`PassageGlossaryEntry` も同様に書き（`@@index([passageId])`、`@@index([lemma])`、逆参照 `targetedBy Question[] @relation("QuestionTarget")`）、content-collection step1 の `Passage` に `questions Question[]` と `glossaryEntries PassageGlossaryEntry[]` を足す。CHECK 制約は Prisma で表現できないので、Prisma 実装の Repository は `type` を `isQuestionType`（`rules/question.ts` に type guard を足す）で検証してから domain 型にする。

### 6. マイグレーション

```bash
pnpm --filter api db:generate   # 生成された SQL の CHECK / FK / index を目で確認する
pnpm --filter api db:migrate
pnpm --filter @repo/db prisma:generate
```

## 動作確認

```bash
pnpm --filter @repo/domain test
pnpm --filter api test        # マイグレーションが test DB に流れ、既存テストが通ること
pnpm build
```

`packages/domain/test/rules/passage.test.ts`（境界値は必須）：

- [ ] `calculateQuestionCount`：300 → 3、301 → 4、450 → 4、451 → 5
- [ ] `calculateTimeLimitSeconds`：難易度 2・400 語・4 問 → 360（README の例。ちょうど 30 の倍数は切り上げない）
- [ ] 332 語・難易度 2・4 問 → 330（326 秒を切り上げ）、難易度 1 / 3 の WPM が使われること
- [ ] 計算結果が 30 秒単位を 1 秒でも超えたら次の 30 秒に切り上がること（例：331 秒相当 → 360）

`packages/domain/test/rules/passage-text.test.ts`：

- [ ] `findSurfaceRange`：最初の出現の位置を返す / 単語の途中（`use` と `because`）は採用しない / 大文字小文字が違えば null / 熟語（`opt out of`）
- [ ] `findSurfaceRange`：バッククォートを含む本文でも生の文字列上の位置になる
- [ ] `isSurfaceAt`：位置がずれていれば false
- [ ] `hasQuote`：本文の `` `useEffect` `` と引用の `useEffect` が一致する / 含まれなければ false
- [ ] `numberParagraphs`：heading と code が null、他は 1 から連番

DB の確認（psql か Drizzle Studio）：

- [ ] `questions.type` に未知の値、`correct_choice_index = 4`、vocabulary 以外での `target_glossary_entry_id` の insert が CHECK で失敗する
- [ ] 同じ `(passage_id, order_index)` の 2 行目が unique 制約で失敗する
- [ ] 用語集の項目を消すと設問の `target_glossary_entry_id` が NULL になる。`passages` の行を消すと設問・用語集が消える
