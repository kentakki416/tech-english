# step2-api-vocabulary-session

単語帳のトップの数 `GET /api/vocabulary/summary` と、1 回分のカード `GET /api/vocabulary/session` を実装する。出題の候補を引き、見出し語ごとに「最後に出会った場所」を選び、意味と本文の 1 文からカードの中身を組み立てる。どちらも読み取りだけで、何も書き込まない。答えの保存は [step3](./step3-api-vocabulary-review.md)。

## 前提

- [step1-db-vocabulary-cards](./step1-db-vocabulary-cards.md)（`vocabulary_cards` / `vocabulary_reviews`、`@repo/domain` の `VOCABULARY_SESSION_SIZE`・`normalizeVocabularyLemma`）
- 材料のテーブル：`attempt_word_lookups` / `reading_attempts` / `dictionary_entries`（[reading-practice](../../reading-practice/README.md#必要な-db-設計)）、`passages` / `passage_glossary_entries`（[question-generation](../../question-generation/README.md#必要な-db-設計)）
- 仕様は README の [出題する単語](../README.md#出題する単語)・[カードの中身の組み立て](../README.md#カードの中身の組み立て)・[1 回分の選び方](../README.md#1-回分の選び方)

## 対応内容

### 1. API スキーマ

`packages/schema/src/api-schema/vocabulary.ts` を新設し、`index.ts` に `export * from "./vocabulary"` を足す（ファイル名順）。`POST /api/vocabulary/review` のスキーマは [step3](./step3-api-vocabulary-review.md) で同じファイルに足す。

```typescript
/** packages/schema/src/api-schema/vocabulary.ts */
import { z } from "zod"

import { WORD_LOOKUP_SOURCES } from "@repo/domain"

// ========================================================
// GET /api/vocabulary/summary - 単語帳のトップの数
// ========================================================

/**
 * 単語帳のトップのレスポンススキーマ。next_due_date は今日の復習が無いときの、次に復習のカードが出る日（無ければ null）
 */
export const getVocabularySummaryResponseSchema = z.object({
  due_count: z.number().int().min(0),
  learning_count: z.number().int().min(0),
  mastered_count: z.number().int().min(0),
  new_count: z.number().int().min(0),
  next_due_date: z.string().nullable(),
})

export type GetVocabularySummaryResponse = z.infer<typeof getVocabularySummaryResponseSchema>

// ========================================================
// GET /api/vocabulary/session - 1 回分のカード
// ========================================================

/**
 * 1 回分のカードのレスポンススキーマ（最大 VOCABULARY_SESSION_SIZE 枚。今日の復習 → 新しい単語の順）
 */
export const getVocabularySessionResponseSchema = z.object({
  cards: z.array(
    z.object({
      /**
       * 正規化した見出し語（小文字）。答えの保存でそのまま送る
       */
      lemma: z.string(),
      meaning_ja: z.string(),
      /**
       * glossary は用語集の文脈での意味、dictionary は英和辞書の意味
       */
      meaning_source: z.enum(WORD_LOOKUP_SOURCES),
      note_ja: z.string().nullable(),
      part_of_speech: z.string().nullable(),
      passage: z.object({ id: z.number().int(), title: z.string() }),
      /**
       * 単語を含む本文の 1 文（インラインコードのバッククォートは残す）。highlight_* は文の中での単語の位置 [start, end)。見つからなければ null
       */
      sentence: z
        .object({ highlight_end: z.number().int(), highlight_start: z.number().int(), text: z.string() })
        .nullable(),
      /**
       * 答える前の段階（0〜3）。新しい単語は null
       */
      stage: z.number().int().min(0).max(3).nullable(),
      /**
       * 本文中の表記
       */
      surface: z.string(),
    }),
  ),
  /**
   * users.timezone での今日（YYYY-MM-DD）
   */
  today: z.string(),
})

export type GetVocabularySessionResponse = z.infer<typeof getVocabularySessionResponseSchema>
```

- 意味の出どころは、調べた単語の出どころ（`WORD_LOOKUP_SOURCES`）と同じ値の集合なので、それから作る

### 2. 1 文の切り出し（`lib/extract-sentence.ts`）

DB を知らない純関数。ブロックの本文と単語の位置から、単語を含む 1 文を切り出す。

```typescript
/** apps/api/src/lib/extract-sentence.ts */

/**
 * 切り出した 1 文。highlightStart / highlightEnd は text の中での単語の位置 [start, end)
 */
export type ExtractedSentence = { highlightEnd: number; highlightStart: number; text: string }

/**
 * これより長い文は単語の前後を残して … で切る
 */
const MAX_SENTENCE_LENGTH = 240

/**
 * 長い文を切るとき、単語の前に残す文字数の目安
 */
const CONTEXT_BEFORE_LENGTH = 100

const ELLIPSIS = "…"

/**
 * インラインコード（改行を含まない、対になったバッククォート）。この中の . では文を区切らない
 */
const INLINE_CODE_PATTERN = /`[^`\n]+`/g

/**
 * 文の終わりの記号の直後に空白があれば、そこで文が切れる
 */
const SENTENCE_END_PATTERN = /[.!?](?=\s)/g

/**
 * 文の終わりに見えるが区切らない略語（小文字で比べる）
 */
const ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "vs."]

/**
 * 文の終わりの位置（記号の次の index）の一覧。インラインコードの中と略語は除く
 */
const findSentenceEnds = (text: string): number[] => {
  const codeRanges = [...text.matchAll(INLINE_CODE_PATTERN)].map((match) => ({
    end: match.index + match[0].length,
    start: match.index,
  }))
  return [...text.matchAll(SENTENCE_END_PATTERN)]
    .map((match) => match.index + 1)
    .filter((end) => !codeRanges.some((range) => range.start < end && end <= range.end))
    .filter((end) => !ABBREVIATIONS.some((abbreviation) => text.slice(0, end).toLowerCase().endsWith(abbreviation)))
}

/**
 * 単語の位置 [start, end) を含む 1 文を切り出す。前後の空白は除き、長すぎれば単語の前後を残して … で切る
 */
export const extractSentence = (text: string, range: { end: number; start: number }): ExtractedSentence => {
  const ends = findSentenceEnds(text)
  const rawStart = ends.filter((end) => end <= range.start).at(-1) ?? 0
  const rawEnd = ends.find((end) => end >= range.end) ?? text.length
  const leading = text.slice(rawStart, rawEnd).length - text.slice(rawStart, rawEnd).trimStart().length
  const sentenceStart = rawStart + leading
  const sentence = text.slice(sentenceStart, rawEnd).trimEnd()
  const highlightStart = range.start - sentenceStart
  const highlightEnd = range.end - sentenceStart
  if (sentence.length <= MAX_SENTENCE_LENGTH) return { highlightEnd, highlightStart, text: sentence }

  const cutStart = Math.max(0, Math.min(highlightStart - CONTEXT_BEFORE_LENGTH, sentence.length - MAX_SENTENCE_LENGTH))
  const cutEnd = Math.min(sentence.length, cutStart + MAX_SENTENCE_LENGTH)
  const prefix = cutStart > 0 ? ELLIPSIS : ""
  const suffix = cutEnd < sentence.length ? ELLIPSIS : ""
  return {
    highlightEnd: highlightEnd - cutStart + prefix.length,
    highlightStart: highlightStart - cutStart + prefix.length,
    text: `${prefix}${sentence.slice(cutStart, cutEnd)}${suffix}`,
  }
}
```

- 単語そのものが 240 文字を超えることは無い前提（用語集の語句・調べた語句は短い）
- 切った位置がインラインコードの途中になることはありうる。表示が崩れるだけで意味は読めるので許容する（クライアントはバッククォートが対にならない部分を普通の文字として描く）

### 3. カードの中身の組み立て（`lib/build-vocabulary-card.ts`）

DB を知らない純関数。Repository が返す「出会った場所」から、カードの中身を作る。

```typescript
/** apps/api/src/lib/build-vocabulary-card.ts */
import { findSurfaceRange, type WordLookupSource } from "@repo/domain"

import type { VocabularyEncounter } from "../repository"
import { type ExtractedSentence, extractSentence } from "./extract-sentence"

/**
 * カードの中身（API の snake_case への変換は Controller で行う）
 */
export type VocabularyCardView = {
  lemma: string
  meaningJa: string
  meaningSource: WordLookupSource
  noteJa: string | null
  partOfSpeech: string | null
  passage: { id: number; title: string }
  sentence: ExtractedSentence | null
  /**
   * 答える前の段階。新しい単語は null
   */
  stage: number | null
  surface: string
}

/**
 * 用語集の行が無いとき、本文のブロック（code 以外）を前から探して、語句が最初に見つかった位置の 1 文
 */
const findSentenceBySurface = (encounter: VocabularyEncounter): ExtractedSentence | null => {
  for (const block of encounter.passage.blocks ?? []) {
    if (block.type === "code") continue
    const range = findSurfaceRange(block.text, encounter.surface)
    if (range) return extractSentence(block.text, { end: range.endOffset, start: range.startOffset })
  }
  return null
}

/**
 * 出会った場所からカードの中身を作る。用語集の行があれば文脈での意味と位置を使い、無ければ英和辞書の意味と本文の検索で作る。
 * 意味が無ければ null（Repository が意味のある見出し語だけを返すので、通常は来ない）
 */
export const buildVocabularyCard = (encounter: VocabularyEncounter, stage: number | null): VocabularyCardView | null => {
  const base = { lemma: encounter.lemma, passage: { id: encounter.passage.id, title: encounter.passage.title }, stage }
  const { glossary } = encounter
  if (glossary) {
    const block = encounter.passage.blocks?.[glossary.blockIndex]
    return {
      ...base,
      meaningJa: glossary.meaningJa,
      meaningSource: "glossary",
      noteJa: glossary.noteJa,
      partOfSpeech: glossary.partOfSpeech,
      sentence: block ? extractSentence(block.text, { end: glossary.endOffset, start: glossary.startOffset }) : null,
      surface: glossary.surface,
    }
  }
  if (encounter.dictionaryMeaningJa === null) return null
  return {
    ...base,
    meaningJa: encounter.dictionaryMeaningJa,
    meaningSource: "dictionary",
    noteJa: null,
    partOfSpeech: null,
    sentence: findSentenceBySurface(encounter),
    surface: encounter.surface,
  }
}
```

- `findSurfaceRange` は `@repo/domain` の既存の関数（単語の境界で語句を探す。用語集の位置の再計算と同じ）
- `GlossaryEntry` の `noteJa` / `partOfSpeech` が `undefined` を取る型なら `?? null` に寄せる（実装時に型を確かめる）

### 4. Repository

interface は `src/repository/vocabulary-repository.ts`（`src/repository/index.ts` に `export *` をファイル名順で足す）。[step3](./step3-api-vocabulary-review.md) で書き込みのメソッドを足す。

```typescript
/** apps/api/src/repository/vocabulary-repository.ts */
import type { GlossaryEntry, PassageBlock, VocabularyCard } from "@repo/domain"

/**
 * 見出し語ごとの、最後に出会った場所（カードの中身の材料）。意味が用意できる見出し語だけを返す
 */
export type VocabularyEncounter = {
  /**
   * 見出し語と一致する英和辞書の項目の意味。無ければ null
   */
  dictionaryMeaningJa: string | null
  /**
   * 用語集の行が使えるとき（残っていて、問題が公開中）。使えなければ null
   */
  glossary: Pick<
    GlossaryEntry,
    "blockIndex" | "endOffset" | "id" | "meaningJa" | "noteJa" | "partOfSpeech" | "startOffset" | "surface"
  > | null
  /**
   * 正規化した見出し語（小文字）
   */
  lemma: string
  /**
   * 出会った問題。本文は公開中のときだけ（公開中でなければ null）
   */
  passage: { blocks: PassageBlock[] | null; id: number; title: string }
  /**
   * 調べたとき・用語集の本文中の表記
   */
  surface: string
}

/**
 * 今日の復習のカードと、その中身の材料
 */
export type DueVocabularyCard = {
  card: Pick<VocabularyCard, "dueDate" | "id" | "lemma" | "stage">
  encounter: VocabularyEncounter
}

/**
 * 単語帳のトップの数
 */
export type VocabularyCounts = {
  dueCount: number
  learningCount: number
  masteredCount: number
  newCount: number
  /**
   * 今日より後で一番近い、次に出す日。無ければ null
   */
  nextDueDate: string | null
}

/**
 * 単語帳（vocabulary_cards / vocabulary_reviews と、出題の候補）のリポジトリ。
 * 候補は attempt_word_lookups と、提出した挑戦の問題の passage_glossary_entries から都度集める（vocabulary-cards README「1 回分の選び方」）
 */
export interface VocabularyRepository {
  /**
   * 今日の復習（due_date <= today）を due_date, id の昇順で limit 枚。中身の材料が無い（意味が用意できない）カードは飛ばす
   */
  findDueCards(userId: number, today: string, limit: number): Promise<DueVocabularyCard[]>
  /**
   * 新しい単語（カードの無い見出し語）を優先順に limit 件。
   * 調べた単語（調べたのが新しい順）→ 読んだ本文の用語集（提出したのが新しい問題から、本文に出てくる順）
   */
  findNewEncounters(userId: number, limit: number): Promise<VocabularyEncounter[]>
  /**
   * 単語帳のトップの数。今日の復習と新しい単語は、意味が用意できる見出し語だけを数える
   */
  summarize(userId: number, today: string): Promise<VocabularyCounts>
}
```

#### Drizzle 実装

`src/repository/drizzle/vocabulary-repository.ts`（`DrizzleVocabularyRepository`）。候補の集め方が `DISTINCT ON` と `UNION ALL` を重ねる形なので、クエリビルダではなく `sql` で書き、`this._db.execute(...)` の行を変換する（既存の `healthcheck-repository.ts` と同じ実行の仕方）。3 つのメソッドが同じ候補の CTE を使うので、private メソッドで組み立てる。

```typescript
/**
 * 見出し語ごとの、意味が用意できる最後に出会った場所（encounters）までの CTE。
 *
 * 1. candidates：調べた単語（origin_rank 0）と、提出した挑戦の公開中の問題の用語集（origin_rank 1）を並べる
 * 2. resolved：用語集の行が使えるか（残っていて問題が公開中）と、辞書の意味を付け、どちらも無い行を捨てる
 * 3. encounters：見出し語ごとに、調べた単語を優先し、その中で新しいもの（用語集は本文に出てくる順）を 1 つ選ぶ
 *
 * 意味の無い行を捨ててから選ぶので、最後に調べた場所に意味が無くても、別の場所に意味があればそちらを使う
 */
private _buildEncountersCte(userId: number): SQL {
  return sql`
    WITH candidates AS (
      SELECT lower(l.lemma) AS lemma, l.surface, l.passage_id, l.glossary_entry_id,
             0 AS origin_rank, l.created_at AS encountered_at, 0 AS block_index, 0 AS start_offset, l.id AS tie_id
        FROM attempt_word_lookups l
       WHERE l.user_id = ${userId}
      UNION ALL
      SELECT lower(g.lemma), g.surface, g.passage_id, g.id,
             1, a.submitted_at, g.block_index, g.start_offset, g.id
        FROM reading_attempts a
        JOIN passages p ON p.id = a.passage_id AND p.status = 'published'
        JOIN passage_glossary_entries g ON g.passage_id = a.passage_id
       WHERE a.user_id = ${userId} AND a.status = 'submitted'
    ),
    resolved AS (
      SELECT c.*, g.id AS usable_glossary_id, d.meaning_ja AS dictionary_meaning_ja
        FROM candidates c
        JOIN passages p ON p.id = c.passage_id
        LEFT JOIN passage_glossary_entries g ON g.id = c.glossary_entry_id AND p.status = 'published'
        LEFT JOIN dictionary_entries d ON d.headword = c.lemma
       WHERE g.id IS NOT NULL OR d.id IS NOT NULL
    ),
    encounters AS (
      SELECT DISTINCT ON (lemma) *
        FROM resolved
       ORDER BY lemma, origin_rank, encountered_at DESC, block_index, start_offset, tie_id DESC
    )
  `
}

/**
 * encounters の 1 行を中身の材料に変える列（呼び出し側が FROM encounters e に join して使う）
 */
private _selectEncounterColumns(): SQL {
  return sql`
    e.lemma, e.surface, e.dictionary_meaning_ja,
    p.id AS passage_id, p.title AS passage_title,
    CASE WHEN p.status = 'published' THEN p.blocks END AS passage_blocks,
    g.id AS glossary_id, g.block_index AS glossary_block_index, g.start_offset AS glossary_start_offset,
    g.end_offset AS glossary_end_offset, g.surface AS glossary_surface, g.meaning_ja AS glossary_meaning_ja,
    g.note_ja AS glossary_note_ja, g.part_of_speech AS glossary_part_of_speech
  `
}

public async findNewEncounters(userId: number, limit: number): Promise<VocabularyEncounter[]> {
  const result = await this._db.execute<EncounterRow>(sql`
    ${this._buildEncountersCte(userId)}
    SELECT ${this._selectEncounterColumns()}
      FROM encounters e
      JOIN passages p ON p.id = e.passage_id
      LEFT JOIN passage_glossary_entries g ON g.id = e.usable_glossary_id
     WHERE NOT EXISTS (SELECT 1 FROM vocabulary_cards c WHERE c.user_id = ${userId} AND c.lemma = e.lemma)
     ORDER BY e.origin_rank, e.encountered_at DESC, e.block_index, e.start_offset, e.tie_id DESC
     LIMIT ${limit}
  `)
  return result.rows.map(convertEncounterRowToDomain)
}

public async findDueCards(userId: number, today: string, limit: number): Promise<DueVocabularyCard[]> {
  const result = await this._db.execute<DueCardRow>(sql`
    ${this._buildEncountersCte(userId)}
    SELECT c.id AS card_id, c.stage AS card_stage, c.due_date::text AS card_due_date, ${this._selectEncounterColumns()}
      FROM vocabulary_cards c
      JOIN encounters e ON e.lemma = c.lemma
      JOIN passages p ON p.id = e.passage_id
      LEFT JOIN passage_glossary_entries g ON g.id = e.usable_glossary_id
     WHERE c.user_id = ${userId} AND c.due_date <= ${today}
     ORDER BY c.due_date, c.id
     LIMIT ${limit}
  `)
  return result.rows.map((row) => ({
    card: { dueDate: row.card_due_date, id: row.card_id, lemma: row.lemma, stage: row.card_stage },
    encounter: convertEncounterRowToDomain(row),
  }))
}

public async summarize(userId: number, today: string): Promise<VocabularyCounts> {
  const result = await this._db.execute<SummaryRow>(sql`
    ${this._buildEncountersCte(userId)}
    SELECT
      (SELECT count(*)::int FROM vocabulary_cards c JOIN encounters e ON e.lemma = c.lemma
        WHERE c.user_id = ${userId} AND c.due_date <= ${today}) AS due_count,
      (SELECT count(*)::int FROM encounters e
        WHERE NOT EXISTS (SELECT 1 FROM vocabulary_cards c WHERE c.user_id = ${userId} AND c.lemma = e.lemma)) AS new_count,
      (SELECT count(*)::int FROM vocabulary_cards WHERE user_id = ${userId} AND stage < ${VOCABULARY_MASTERED_STAGE}) AS learning_count,
      (SELECT count(*)::int FROM vocabulary_cards WHERE user_id = ${userId} AND stage = ${VOCABULARY_MASTERED_STAGE}) AS mastered_count,
      (SELECT min(due_date)::text FROM vocabulary_cards WHERE user_id = ${userId} AND due_date > ${today}) AS next_due_date
  `)
  const [row] = result.rows
  return {
    dueCount: row.due_count,
    learningCount: row.learning_count,
    masteredCount: row.mastered_count,
    newCount: row.new_count,
    nextDueDate: row.next_due_date,
  }
}
```

- `EncounterRow` / `DueCardRow` / `SummaryRow` は、このファイルの中だけの行の型（snake_case の列名そのまま）。`convertEncounterRowToDomain` は `glossary_id` が NULL なら `glossary: null`、`passage_blocks` が NULL なら `blocks: null` にする
- **日付は `::text` で受け取る**（`execute` の結果はドライバの既定の変換を通るので、`date` が JS の `Date` になるのを避ける）。件数は `::int`（`count` の bigint を文字列で受け取らないため）
- `passage_blocks` は jsonb なので `PassageBlock[]` としてそのまま使う。新しい単語・今日の復習はどちらも最大 10 行なので、本文を 10 回分読んでも重くない（`summarize` は本文を読まない）
- index：候補は `attempt_word_lookups (user_id, lemma)`・`reading_attempts (user_id, study_date)`・`passage_glossary_entries (passage_id)`、カードは `vocabulary_cards (user_id, lemma)` / `(user_id, due_date)`、辞書は `dictionary_entries (headword)` で引ける。1 ユーザーの候補は多くても数千行なので都度の集計で足りる
- `src/repository/drizzle/index.ts` に `export *` で足す

### 5. Service

`src/service/vocabulary-service.ts` を新設し、`src/service/index.ts` に `export * as vocabulary from "./vocabulary-service"` を足す（ファイル名順）。「今日」は learning-record と同じく `users.timezone` で求める。

```typescript
/** apps/api/src/service/vocabulary-service.ts */
import { type User, VOCABULARY_SESSION_SIZE } from "@repo/domain"
import { err, ok, Result, unauthorizedError } from "@repo/errors"

import { buildVocabularyCard, type VocabularyCardView } from "../lib/build-vocabulary-card"
import { formatDateInTimeZone } from "../lib/time-zone"
import type { UserRepository, VocabularyCounts, VocabularyRepository } from "../repository"

/**
 * 1 回分のカード
 */
export type VocabularySession = { cards: VocabularyCardView[]; today: string }

type VocabularyReadRepo = { userRepository: UserRepository; vocabularyRepository: VocabularyRepository }

/**
 * 「今日」を求めるのにタイムゾーンが要るため、読み取りの API でもユーザーが無ければ 401 にする（learning-record と同じ）
 */
const findUser = async (userId: number, repo: { userRepository: UserRepository }): Promise<Result<User>> => {
  const user = await repo.userRepository.findById(userId)
  if (!user) return err(unauthorizedError("User not found"))
  return ok(user)
}

/**
 * 単語帳のトップの数（今日の復習・新しい単語・復習中・覚えた単語・次の復習の日）
 */
export const getVocabularySummary = async (
  userId: number,
  repo: VocabularyReadRepo,
  deps: { now: Date },
): Promise<Result<VocabularyCounts>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const today = formatDateInTimeZone(deps.now, userResult.value.timezone)
  return ok(await repo.vocabularyRepository.summarize(userId, today))
}

/**
 * 1 回分のカード（最大 VOCABULARY_SESSION_SIZE 枚）。今日の復習を先に入れ、余った枠を新しい単語で埋める。何も書き込まない
 */
export const getVocabularySession = async (
  userId: number,
  repo: VocabularyReadRepo,
  deps: { now: Date },
): Promise<Result<VocabularySession>> => {
  const userResult = await findUser(userId, repo)
  if (!userResult.ok) return userResult
  const today = formatDateInTimeZone(deps.now, userResult.value.timezone)

  const dueCards = await repo.vocabularyRepository.findDueCards(userId, today, VOCABULARY_SESSION_SIZE)
  const restCount = VOCABULARY_SESSION_SIZE - dueCards.length
  const newEncounters = restCount > 0 ? await repo.vocabularyRepository.findNewEncounters(userId, restCount) : []

  const cards = [
    ...dueCards.map(({ card, encounter }) => buildVocabularyCard(encounter, card.stage)),
    ...newEncounters.map((encounter) => buildVocabularyCard(encounter, null)),
  ].filter((card): card is VocabularyCardView => card !== null)
  return ok({ cards, today })
}
```

- `nextDueDate` は今日の復習があっても返る（今日より後で一番近い日）。出すかどうかはクライアントが `due_count` で決める（README の [必要な API](../README.md#必要な-api)）

### 6. Controller

`src/controller/vocabulary/summary.ts`（`VocabularySummaryController`）と `session.ts`（`VocabularySessionController`）。learning-record の Controller と同じく `AuthRequest` の `req.userId!` と `{ now: new Date() }` を渡し、try-catch は書かない。

```typescript
/** apps/api/src/controller/vocabulary/session.ts */
export class VocabularySessionController {
  constructor(
    private _userRepository: UserRepository,
    private _vocabularyRepository: VocabularyRepository,
  ) {}

  public async execute(req: AuthRequest, res: Response) {
    const result = await service.vocabulary.getVocabularySession(
      req.userId!,
      { userRepository: this._userRepository, vocabularyRepository: this._vocabularyRepository },
      { now: new Date() },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }

    const response = parseResponse(getVocabularySessionResponseSchema, {
      cards: result.value.cards.map((card) => ({
        lemma: card.lemma,
        meaning_ja: card.meaningJa,
        meaning_source: card.meaningSource,
        note_ja: card.noteJa,
        part_of_speech: card.partOfSpeech,
        passage: card.passage,
        sentence: card.sentence === null
          ? null
          : { highlight_end: card.sentence.highlightEnd, highlight_start: card.sentence.highlightStart, text: card.sentence.text },
        stage: card.stage,
        surface: card.surface,
      })),
      today: result.value.today,
    })
    return res.status(200).json(response)
  }
}
```

`VocabularySummaryController` は同じ形で `service.vocabulary.getVocabularySummary` の結果を `getVocabularySummaryResponseSchema`（`due_count` / `learning_count` / `mastered_count` / `new_count` / `next_due_date`）で返す（200）。

### 7. Router と DI

`src/routes/vocabulary-router.ts` を新設する。既存の `dictionary-router.ts` と同じく、渡されたコントローラーのルートだけを登録する。

```typescript
/** apps/api/src/routes/vocabulary-router.ts */
type VocabularyRouterControllers = {
  session?: VocabularySessionController
  summary?: VocabularySummaryController
}

/**
 * 単語帳のルーター（/api/vocabulary にマウントする）。認証必須（PUBLIC_PATHS に入れない）。
 * 渡されたコントローラーのルートのみ登録する
 */
export const vocabularyRouter = (controllers: VocabularyRouterControllers): Router => {
  const router = Router()

  /**
   * GET /api/vocabulary/session
   */
  if (controllers.session) {
    const controller = controllers.session
    router.get("/session", async (req, res) => controller.execute(req, res))
  }

  /**
   * GET /api/vocabulary/summary
   */
  if (controllers.summary) {
    const controller = controllers.summary
    router.get("/summary", async (req, res) => controller.execute(req, res))
  }

  return router
}
```

`src/index.ts` で `const vocabularyRepository = new DrizzleVocabularyRepository(db)` を作り、2 つの Controller を生成して `app.use("/api/vocabulary", vocabularyRouter({ session, summary }))` を `/api/dictionary` の後に足す（キーはアルファベット順）。認証必須なので `PUBLIC_PATHS` には足さない。

## 動作確認

```bash
pnpm --filter @repo/api-schema build
pnpm --filter api test
pnpm lint:fix
```

### lib のユニットテスト

`test/lib/extract-sentence.test.ts`：

- 正常系
  - [ ] 3 文のブロックで、2 文目の単語の位置を渡すと 2 文目だけが返り、`highlight*` が文の中の位置になる
  - [ ] 1 文目・最後の文（ブロックの端まで）・1 文だけのブロック（境界値）
  - [ ] `?` `!` で区切れる。記号の直後に空白が無い `.`（`Object.is`・`v1.2`）では区切らない
  - [ ] インラインコードの中の `. `（`` `a. b` ``）では区切らない
  - [ ] `e.g.` `i.e.` `etc.` `vs.` の後では区切らない
  - [ ] 文の前後の空白（改行を含む）が除かれる
  - [ ] 240 文字ちょうどの文は切らず、241 文字の文は単語を含む 240 文字に切られて前後に `…` が付き、`highlight*` が切った後の文字列で単語を指す（境界値）
  - [ ] 単語が長い文の先頭・末尾にあるとき、片側だけに `…` が付く

`test/lib/build-vocabulary-card.test.ts`：

- 正常系
  - [ ] 用語集の行があれば、意味・補足・品詞・語句は用語集のもの、`meaningSource` は `glossary`、1 文は `blockIndex` と位置から切り出す
  - [ ] 用語集の行が無く辞書の意味があれば、`meaningSource` は `dictionary`、補足・品詞は `null`、1 文は本文を前から探して最初に見つかった位置（`code` のブロックは飛ばす）
  - [ ] `stage` は渡した値（新しい単語は `null`）のまま
- 異常系
  - [ ] 本文が `null`（問題が公開中でない）なら `sentence: null`
  - [ ] 語句が本文に見つからなければ `sentence: null`
  - [ ] 用語集の行も辞書の意味も無ければ `null`

### Repository のテスト

`test/repository/vocabulary-repository.test.ts`（実 DB）。用語集つきの公開中の問題は `insertGeneratedPassage`、提出は `createSubmittedAttempt`、調べた単語とカードは `test/fixture/vocabulary.ts` を新設して `insertWordLookup(attemptId, overrides)`・`insertVocabularyCard(userId, overrides)` を置く。辞書は `dictionary_entries` に直接入れる。

- `findNewEncounters` 正常系
  - [ ] 調べた単語が、読んだ本文の用語集より先に並ぶ。調べた単語の中は調べたのが新しい順
  - [ ] 読んだ本文の用語集は、提出したのが新しい問題から、本文に出てくる順（`block_index` → `start_offset`）
  - [ ] 同じ見出し語を 2 つの問題で調べていれば、最後に調べた方の語句・問題になる（1 件にまとまる）
  - [ ] 大文字の見出し語（`Effect`）と小文字（`effect`）は 1 件にまとまり、`lemma` は小文字
  - [ ] 用語集から引いた調べた単語は、用語集の行（意味・位置）が付く
  - [ ] 辞書で引いた調べた単語は `glossary: null`・`dictionaryMeaningJa` あり
  - [ ] カードのある見出し語は返らない
  - [ ] `limit` を超えない
- `findNewEncounters` 異常系（出さないもの）
  - [ ] 提出していない挑戦（`in_progress` / `expired`）の問題の用語集は返らない
  - [ ] 他のユーザーの調べた単語・挑戦は返らない
  - [ ] 公開中でなくなった問題の用語集は返らない。その問題で調べた単語は、辞書に意味があれば `glossary: null` で返り（本文は `null`）、無ければ返らない
  - [ ] 用語集の行が消えた（`glossary_entry_id` が NULL）調べた単語は、辞書に意味があれば辞書で返る
  - [ ] 最後に調べた場所に意味が無くても、別の場所（読んだ本文の用語集）に意味があればそちらで返る
- `findDueCards`
  - [ ] `due_date` が今日・昨日のカードが `due_date, id` の昇順で返り、明日のカード・覚えた単語（`due_date` NULL）は返らない（境界値）
  - [ ] `card.dueDate` が `"YYYY-MM-DD"` の文字列で返る
  - [ ] 中身の材料が無いカード（候補から消えた見出し語）は飛ばされ、`limit` 枚まで次のカードで埋まる
- `summarize`
  - [ ] 今日の復習・新しい単語・復習中（段階 0〜3）・覚えた単語（段階 4）の数と、今日より後で一番近い `nextDueDate`（`"YYYY-MM-DD"`）
  - [ ] 何も無いユーザーはすべて 0 と `nextDueDate: null`

### Service のユニットテスト

`test/service/vocabulary-service/getVocabularySession.test.ts`・`getVocabularySummary.test.ts`（Repository は `vi.fn()`、`now` は固定）:

- 正常系
  - [ ] 今日の復習が 10 枚なら `findNewEncounters` を呼ばない
  - [ ] 今日の復習が 3 枚なら `findNewEncounters(userId, 7)` を呼び、復習 → 新しい単語の順に並ぶ
  - [ ] `today` は `users.timezone` で求める（`2026-10-14T15:30:00Z` は `Asia/Tokyo` で `2026-10-15`、`UTC` で `2026-10-14`。境界値）
  - [ ] 中身を組み立てられない材料は飛ばされる
- 異常系
  - [ ] ユーザーが無ければ `ok: false`・`statusCode: 401` で、`vocabularyRepository` は呼ばれない
  - [ ] Repository が throw したらそのまま reject する

### Controller のインテグレーションテスト

`test/controller/vocabulary/session.test.ts`・`summary.test.ts`（実 DB、ユーザーは `createTestUser`）:

- 正常系
  - [ ] 問題を解いていないユーザーは `cards: []`、summary はすべて 0
  - [ ] 問題を提出し単語を調べたユーザーは、調べた単語 → 用語集の順のカードが返り、レスポンス全体が `toEqual`（`sentence` の位置まで）
  - [ ] 今日の復習のカードが新しい単語より先に来て、`stage` が入る
  - [ ] 呼んでも `vocabulary_cards` / `vocabulary_reviews` の行が増えない（読み取りのみ）
- 異常系
  - [ ] トークンなし・無効なトークンで 401
  - [ ] トークンのユーザーが存在しない（`generateAccessToken(999999)`）と 401

### 手動確認

`pnpm --filter api db:seed:sample-passages` で公開中の問題を入れ、web で 1 問解いて単語を調べてから:

```bash
curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/api/vocabulary/summary
curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/api/vocabulary/session | jq '.cards[] | {surface, meaning_source, sentence}'
```

- [ ] 調べた単語が先に、用語集の単語が後に並び、`sentence.text` の `highlight_start`〜`highlight_end` が語句になっている
